import { spawnSync } from 'node:child_process'

if (process.env.CRRT_VERCEL_BUILD_ACTIVE === '1') {
  throw new Error('Recursive Vercel build prevented: nested API builders must not invoke vercel-build')
}
const result = spawnSync(process.execPath, ['run', 'deploy-build'], {
  stdio: 'inherit',
  env: { ...process.env, CRRT_VERCEL_BUILD_ACTIVE: '1' },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
