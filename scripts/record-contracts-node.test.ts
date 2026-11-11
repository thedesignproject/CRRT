import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

it('loads emitted Record contracts under Node without bundler import resolution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crrt-record-node-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir')
    for (const name of ['contracts', 'limits']) {
      const source = await readFile(`shared/record/${name}.ts`, 'utf8')
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      await writeFile(join(root, `${name}.js`), outputText)
    }
    const result = spawnSync('node', [join(root, 'contracts.js')], {
      encoding: 'utf8', timeout: 15_000,
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
