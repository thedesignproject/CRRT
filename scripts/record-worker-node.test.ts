import { expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { WORKER_COMPLETION_CONTENT } from '../shared/record/worker-completion.js'

it.each(['success', 'without-marker', 'stage-failure', 'marker-failure'])(
  'exits the actual one-shot Node entrypoint despite a referenced handle: %s', async scenario => {
    const root = await mkdtemp(join(tmpdir(), 'crrt-worker-exit-'))
    try {
      async function write(path: string, contents: string) {
        await mkdir(dirname(join(root, path)), { recursive: true })
        await writeFile(join(root, path), contents)
      }
      await write('package.json', JSON.stringify({ type: 'module' }))
      for (const name of ['scripts/record-worker', 'shared/record/worker-completion']) {
        const source = await readFile(`${name}.ts`, 'utf8')
        await write(`${name}.js`, ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText)
      }
      await write('api/_lib/record/core.js', 'export async function rpc() {}')
      await write('api/_lib/record/processing.js', `
        import { appendFile } from 'node:fs/promises';
        setInterval(() => {}, 1000); // Reproduce a dependency retaining the event loop.
        export async function runNext(stage) {
          await new Promise(resolve => setTimeout(resolve, 10));
          if (process.env.FAIL_STAGE === stage) throw new Error('fixture failure');
          await appendFile(process.env.STAGE_LOG, stage + '\\n');
          return true;
        }
      `)
      const marker = join(root, 'completed')
      const stageLog = join(root, 'stages')
      const result = spawnSync(process.execPath, [join(root, 'scripts/record-worker.js'), '--once'], {
        encoding: 'utf8', timeout: 3000,
        env: { PATH: process.env.PATH, CRRT_RECORD_ENABLED: 'true', STAGE_LOG: stageLog,
          ...(scenario === 'without-marker' ? {} : {
            CRRT_RECORD_WORKER_COMPLETION_FILE: scenario === 'marker-failure' ? join(root, 'missing/completed') : marker,
          }),
          ...(scenario === 'stage-failure' ? { FAIL_STAGE: 'transcription' } : {}),
        },
      })
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status, result.stderr).toBe(scenario.endsWith('failure') ? 1 : 0)
      expect(await readFile(stageLog, 'utf8')).toBe(scenario === 'stage-failure'
        ? 'metadata\n' : 'metadata\ntranscription\nalignment\ncleanup\n')
      if (scenario === 'success') {
        expect(await readFile(marker, 'utf8')).toBe(WORKER_COMPLETION_CONTENT)
        await expect(readFile(`${marker}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' })
      } else {
        await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  },
)
