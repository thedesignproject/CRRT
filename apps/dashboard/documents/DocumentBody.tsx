import { useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export type DocumentQuote = { quote: string; prefix: string; suffix: string }
export function documentHtml(source: string) {
  return DOMPurify.sanitize(marked.parse(source, { async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'style', 'form', 'input', 'button', 'video', 'audio'],
    FORBID_ATTR: ['style', 'id', 'name', 'background']
  })
}
export function quoteMatches(source: string, anchor: DocumentQuote) {
  const root = document.createElement('div')
  root.innerHTML = documentHtml(source)
  if (!anchor.quote.length) return false
  const text = root.textContent!
  let matches = 0
  for (let index = text.indexOf(anchor.quote); index >= 0; index = text.indexOf(anchor.quote, index + 1)) {
    if (text.slice(0, index).endsWith(anchor.prefix) && text.slice(index + anchor.quote.length).startsWith(anchor.suffix)) matches++
  }
  return matches === 1
}
export function DocumentBody({ source, onQuote }: { source: string; onQuote?: (quote: DocumentQuote) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const html = useMemo(() => documentHtml(source), [source])
  function capture() {
    const selection = window.getSelection()
    if (!onQuote || !selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!root.current!.contains(range.commonAncestorContainer)) return
    const quote = range.toString()
    if (!quote.trim() || quote.length > 2000) return
    const before = document.createRange()
    before.selectNodeContents(root.current!)
    before.setEnd(range.startContainer, range.startOffset)
    const start = before.toString().length,
      text = root.current!.textContent!
    onQuote({ quote, prefix: text.slice(Math.max(0, start - 64), start), suffix: text.slice(start + quote.length, start + quote.length + 64) })
  }
  return <div ref={root} className="document-prose" onMouseUp={capture} onKeyUp={capture} dangerouslySetInnerHTML={{ __html: html }} />
}
