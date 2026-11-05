/** Nested @vercel/node builds must not re-enter the top-level deployment. */
export function apiBuilderPackage(source) {
  const manifest = JSON.parse(source)
  if (manifest.scripts) {
    delete manifest.scripts['vercel-build']
    delete manifest.scripts['now-build']
  }
  return JSON.stringify(manifest, null, 2)
}
