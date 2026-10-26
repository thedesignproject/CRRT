import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { askJev } from './decide'
import { buildProps } from './mock-data'

export const SELECTION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'preview/selection.json')
export const PREVIEW_URL = 'http://127.0.0.1:4340/'

/** Asks Jev, builds the chosen component's props from mock data, and publishes them to the preview. */
export async function runJev(question: string) {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim()
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set (add it to .env.local).')
  const decision = await askJev(question, { apiKey, model: process.env.JEV_MODEL?.trim() || undefined })
  const rendered = buildProps(decision)
  const selection = { question, decision, ...rendered, answeredAt: new Date().toISOString() }
  writeFileSync(SELECTION_PATH, `${JSON.stringify(selection, null, 2)}\n`)
  return selection
}
