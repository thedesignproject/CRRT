// bun scripts/jev/cli.ts "how many comments have I not resolved yet?"
import { PREVIEW_URL, runJev } from './run'

const question = process.argv.slice(2).join(' ').trim()
if (!question) {
  console.error('Usage: bun scripts/jev/cli.ts "<question>"')
  process.exit(1)
}
try {
  const { decision, component } = await runJev(question)
  console.log(JSON.stringify({ question, component, decision }, null, 2))
  console.error(`Rendered ${component} at ${PREVIEW_URL}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
