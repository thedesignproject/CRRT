import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { build } from '@vercel/node'
import { FileFsRef, glob } from '@vercel/build-utils'
import { PRODUCT_AUDIT_WORKFLOW_ID } from '../workflows/product-audit-id.js'

const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const output = join(root, '.vercel/output')

async function apiFiles(directory = join(root, 'api')): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '_lib') files.push(...await apiFiles(path))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(relative(root, path))
    }
  }
  return files
}

function routeDefinition(file: string) {
  const names: string[] = []
  const path = `/${file.replace(/\.ts$/, '').replace(/\/index$/, '')}`
  const pattern = path.split('/').map((segment) => {
    const parameter = segment.match(/^\[([^\]]+)\]$/)
    if (parameter) {
      names.push(parameter[1])
      return '([^/]+)'
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('/')
  return { file, names, pattern: `^${pattern}/?$` }
}

function routerSource(routes: ReturnType<typeof routeDefinition>[]) {
  const imports = routes.map(({ file }, index) =>
    `import route${index} from './${file.slice(4).replace(/\.ts$/, '.js')}'`).join('\n')
  const definitions = routes.map(({ names, pattern }, index) =>
    `{ handler: route${index}, pattern: new RegExp(${JSON.stringify(pattern)}), names: ${JSON.stringify(names)} }`).join(',\n')
  return `${imports}
const routes = [${definitions}]
export default async function handler(req: any, res: any) {
  const routed = Array.isArray(req.query.__audit_path) ? req.query.__audit_path[0] : req.query.__audit_path
  const path = routed || new URL(req.url || '/', 'http://localhost').pathname
  delete req.query.__audit_path
  const route = routes.find((candidate) => candidate.pattern.test(path))
  if (!route) return res.status(404).json({ error: 'Not found' })
  const match = route.pattern.exec(path)
  route.names.forEach((name, index) => { req.query[name] = decodeURIComponent(match?.[index + 1] || '') })
  return route.handler(req, res)
}
`
}

async function buildApiFunction() {
  const temporary = await mkdtemp(join(tmpdir(), 'crrt-vercel-'))
  try {
    const routes = (await apiFiles()).map(routeDefinition)
      .sort((left, right) => left.names.length - right.names.length)
    const generated = join(temporary, '__vercel-router.ts')
    await writeFile(generated, routerSource(routes))
    const files = await glob('**', {
      cwd: root, dot: true,
      ignore: ['.git/**', '.vercel/**', '.workflow-data/**', 'coverage/**', 'node_modules/**'],
    })
    files['api/__vercel-router.ts'] = new FileFsRef({ fsPath: generated })
    const result = await build({
      files, entrypoint: 'api/__vercel-router.ts', workPath: temporary, repoRootPath: temporary,
      config: {}, meta: {},
    })
    if (!('output' in result) || result.output.type !== 'Lambda' || !result.output.files) {
      throw new Error('Vercel API builder did not return a Node function')
    }
    const lambda = result.output
    const functionDirectory = join(output, 'functions/api-router.func')
    for (const [path, file] of Object.entries(lambda.files)) {
      const destination = join(functionDirectory, path)
      await mkdir(dirname(destination), { recursive: true })
      if ('fsPath' in file) await cp(String(file.fsPath), destination)
      else if ('data' in file) await writeFile(destination, file.data)
      else throw new Error(`Unsupported Vercel output file: ${path}`)
    }
    await writeFile(join(functionDirectory, '.vc-config.json'), JSON.stringify({
      runtime: lambda.runtime, handler: lambda.handler, launcherType: 'Nodejs',
      architecture: lambda.architecture, memory: 128, maxDuration: 10,
      shouldAddHelpers: true, shouldAddSourcemapSupport: true,
    }, null, 2))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

await exec('bun', ['x', 'workflow', 'build', '--target', 'vercel-build-output-api'], { cwd: root })
const manifest = JSON.parse(await readFile(join(output, 'diagnostics/workflows-manifest.json'), 'utf8')) as {
  workflows?: Record<string, Record<string, { workflowId?: string }>>
}
const workflowIds = Object.values(manifest.workflows || {})
  .flatMap((file) => Object.values(file))
  .map((workflow) => workflow.workflowId)
if (!workflowIds.includes(PRODUCT_AUDIT_WORKFLOW_ID)) {
  throw new Error(`Product Audit workflow registration mismatch: expected ${PRODUCT_AUDIT_WORKFLOW_ID}`)
}
await rm(join(output, 'static'), { recursive: true, force: true })
await cp(join(root, 'apps/landing/dist'), join(output, 'static'), { recursive: true })
await buildApiFunction()
const workflowConfig = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'))
workflowConfig.routes = [
  { src: '^/api(?:/.*)?$', headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Id, Idempotency-Key, X-Audit-Session, X-Audit-Token, X-Reviewer-Token, X-Share-Token, X-Smoke-Cleanup-Token',
    'Access-Control-Max-Age': '86400',
  }, continue: true },
  ...workflowConfig.routes,
  { src: '^(/api(?:/.*)?)$', dest: '/api-router?__audit_path=$1' },
  { handle: 'filesystem' },
  { src: '^/d/[^/]+/?$', dest: '/index.html' },
  { src: '^/docs(?:/.*)?$', dest: '/index.html' },
  { src: '^/dashboard(?:/.*)?$', dest: '/dashboard/index.html' },
  { src: '^/audit(?:/.*)?$', dest: '/index.html' },
]
await writeFile(join(output, 'config.json'), JSON.stringify(workflowConfig, null, 2))
