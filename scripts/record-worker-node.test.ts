import { expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { workerCompletionLog, workerFailureLog } from '../shared/record/worker-completion.js'

it.each(['success', 'stage-failure'])(
  'exits the actual one-shot Node entrypoint despite a referenced handle: %s',
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), 'crrt-worker-exit-'))
    try {
      async function write(path: string, contents: string) {
        await mkdir(dirname(join(root, path)), { recursive: true })
        await writeFile(join(root, path), contents)
      }
      await write('package.json', JSON.stringify({ type: 'module' }))
      for (const name of ['scripts/record-worker', 'shared/record/worker-completion']) {
        const source = await readFile(`${name}.ts`, 'utf8')
        await write(
          `${name}.js`,
          ts.transpileModule(source, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          }).outputText,
        )
      }
      await write('api/_lib/record/core.js', 'export async function rpc() {}')
      await write(
        'api/_lib/record/processing.js',
        `
        import { appendFile } from 'node:fs/promises';
        setInterval(() => {}, 1000); // Reproduce a dependency retaining the event loop.
        export async function runNext(stage) {
          await new Promise(resolve => setTimeout(resolve, 10));
          if (process.env.FAIL_STAGE === stage) throw new Error('fixture failure https://user:private-key@example.test');
          await appendFile(process.env.STAGE_LOG, stage + '\\n');
          return true;
        }
      `,
      )
      const stageLog = join(root, 'stages')
      const result = spawnSync(process.execPath, [join(root, 'scripts/record-worker.js'), '--once'], {
        encoding: 'utf8',
        timeout: 3000,
        env: {
          PATH: process.env.PATH,
          CRRT_RECORD_ENABLED: 'true',
          STAGE_LOG: stageLog,
          ...(scenario === 'stage-failure' ? { FAIL_STAGE: 'transcription' } : {}),
        },
      })
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status, result.stderr).toBe(scenario === 'stage-failure' ? 1 : 0)
      expect(result.stderr).not.toContain('private-key')
      if (scenario === 'stage-failure') {
        expect(result.stderr.trim()).toBe('record_worker_failed type=Error code=unknown')
        expect(result.stdout).toBe('')
      } else {
        // The retained interval is reported by type only.
        expect(result.stdout).toMatch(/^record_worker_complete active_resources=\S*Timeout:1\S*\n$/)
      }
      expect(await readFile(stageLog, 'utf8')).toBe(
        scenario === 'stage-failure' ? 'metadata\n' : 'metadata\ntranscription\nalignment\ncleanup\n',
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

it('logs only sanitized failure identifiers', () => {
  const error = Object.assign(new TypeError('postgres://user:secret@db.example'), { code: 'PGRST301' })
  expect(workerFailureLog(error)).toBe('record_worker_failed type=TypeError code=PGRST301')
  expect(workerFailureLog(Object.assign(new Error('x'), { name: 'Bad name with spaces', code: 42 }))).toBe(
    'record_worker_failed type=unknown code=unknown',
  )
  expect(workerFailureLog(null)).toBe('record_worker_failed type=unknown code=unknown')
  expect(workerFailureLog('secret string')).toBe('record_worker_failed type=unknown code=unknown')
})

it('summarizes active handle types without details', () => {
  expect(workerCompletionLog([])).toBe('record_worker_complete active_resources=none')
  expect(workerCompletionLog(['Timeout', 'TCPSocketWrap', 'Timeout', 'x'.repeat(65)])).toBe(
    'record_worker_complete active_resources=TCPSocketWrap:1,Timeout:2,unknown:1',
  )
})
