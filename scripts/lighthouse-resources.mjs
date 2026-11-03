import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { publicPages } from '../apps/landing/lib/publicPages.ts'
import { summarizeReports, shardPaths } from './lighthouse-budgets.mjs'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const options = new Map(process.argv.slice(2).filter(arg => arg !== '--').map(arg => arg.replace(/^--/, '').split('=')))
const runs = Number(options.get('runs') ?? 3)
const profile = options.get('profile') ?? 'mobile'
if (![1, 2, 3, 4, 5].includes(runs)) throw new Error('--runs must be between 1 and 5')
if (!['mobile', 'desktop'].includes(profile)) throw new Error('--profile must be mobile or desktop')
const allPaths = publicPages.filter(page => page.path.startsWith('/resources')).map(page => page.path)
const paths = shardPaths(options.has('paths') ? options.get('paths').split(',') : allPaths, options.get('shard'))
if (!paths.length || paths.some(path => !allPaths.includes(path))) throw new Error('--paths must contain existing resource URLs')
const port = options.get('port') ?? '4323'
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Invalid --port')
const output = resolve(root, 'artifacts/lighthouse', profile)
await mkdir(output, { recursive: true })

const server = spawn(process.execPath, ['scripts/preview-public-site.ts'], { cwd: root, env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] })
let serverErrors = ''
server.stderr.on('data', data => { serverErrors += data })
const results = []
try {
  await new Promise((ready, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server did not start')), 15_000)
    server.stdout.on('data', data => {
      if (data.toString().includes('CRRT public preview:')) { clearTimeout(timeout); ready() }
    })
    server.once('error', error => { clearTimeout(timeout); reject(error) })
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview server exited (${code}): ${serverErrors}`)) })
  })
  for (const path of paths) {
    const reports = []
    const url = `http://127.0.0.1:${port}${path}`
    for (let run = 1; run <= runs; run++) {
      console.log(`Lighthouse ${profile}: ${path} (${run}/${runs})`)
      const stem = resolve(output, `${path.split('/').filter(Boolean).join('-')}-${run}`)
      await exec(process.execPath, [require.resolve('lighthouse/cli/index.js'), url,
        '--chrome-flags=--headless=new --disable-dev-shm-usage',
        '--only-categories=performance,accessibility,best-practices,seo,agentic-browsing',
        '--output=json', '--output=html', `--output-path=${stem}`, '--quiet',
        ...(profile === 'desktop' ? ['--preset=desktop'] : []),
      ], { cwd: root, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
      reports.push(JSON.parse(await readFile(`${stem}.report.json`, 'utf8')))
    }
    const result = { path, profile, runs, lighthouseVersion: reports[0].lighthouseVersion,
      chrome: reports[0].environment.hostUserAgent,
      agentChecks: reports[0].categories['agentic-browsing'].auditRefs.map(({ id }) => ({ id, score: reports[0].audits[id].score, status: reports[0].audits[id].scoreDisplayMode })),
      ...summarizeReports(reports) }
    results.push(result)
    console.log(`${path}: ${Object.entries(result.scores).map(([key, value]) => `${key}=${Math.round(value * 100)}`).join(' ')}${result.failures.length ? ' FAILED' : ' PASS'}`)
  }
} finally {
  server.kill('SIGTERM')
}
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ measuredAt: new Date().toISOString(), environment: 'Local production build; Lighthouse simulated throttling; no field/CrUX data', results }, null, 2))
const failures = results.flatMap(result => result.failures.map(failure => `${result.path}: ${failure}`))
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }
console.log(`Saved HTML and JSON reports to ${output}`)
