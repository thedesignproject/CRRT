import { useState } from 'react'
import type { Resource } from './model'
import { buildFeedbackBrief, convertCssUnits, parseHex, textContrast, type FeedbackFields } from './toolCalculations'

export function ResourceTool({ kind }: { kind: NonNullable<Resource['tool']> }) {
  return <section className="resource-tool" id="interactive-tool" aria-label="Interactive tool">
    {kind === 'contrast' ? <ContrastChecker /> : kind === 'units' ? <UnitConverter /> : <FeedbackBuilder />}
    <noscript><p>Enable JavaScript to change the inputs and copy results. The worked example and instructions remain available below.</p></noscript>
  </section>
}

function ContrastChecker() {
  const [foreground, setForeground] = useState('#202329')
  const [background, setBackground] = useState('#FFFFFF')
  const [category, setCategory] = useState<'normal' | 'large'>('normal')
  const pair = textContrast(foreground, background)
  const threshold = category === 'normal' ? 4.5 : 3
  const passes = pair ? pair.ratio >= threshold : false
  const result = pair ? `${pair.foreground} on ${pair.background}: ${pair.ratio.toFixed(2)}:1. ${passes ? 'Passes' : 'Does not pass'} the WCAG AA ${category}-text contrast threshold (${threshold}:1). Decision uses the unrounded ratio; this is not a full accessibility audit.` : ''

  return <>
    <h2>Check a text color pair</h2><p>Opaque sRGB HEX colors. Choose the text criterion you want to check.</p>
    <div className="resource-tool-fields">
      <label>Text color<input value={foreground} onChange={event => setForeground(event.target.value)} maxLength={7} spellCheck={false} aria-invalid={!parseHex(foreground)} aria-describedby="contrast-help" /></label>
      <label>Background color<input value={background} onChange={event => setBackground(event.target.value)} maxLength={7} spellCheck={false} aria-invalid={!parseHex(background)} aria-describedby="contrast-help" /></label>
      <label className="resource-tool-wide">Text category<select value={category} onChange={event => setCategory(event.target.value as 'normal' | 'large')}><option value="normal">Normal text · AA 4.5:1</option><option value="large">Large text · AA 3:1</option></select></label>
    </div>
    <p className="resource-tool-help" id="contrast-help">Use three or six HEX digits, such as #fff or #202329. Large text means at least 24 CSS px regular or about 18.67 CSS px bold.</p>
    {pair ? <>
      <div className="resource-contrast-preview" style={{ color: pair.foreground, backgroundColor: pair.background, fontSize: category === 'large' ? 24 : 16 }}>Your next change, clearly explained.</div>
      <output className="resource-tool-result" aria-label="Contrast result" aria-live="polite"><strong>{pair.ratio.toFixed(2)}<span>:1</span></strong><span>{passes ? 'Passes' : 'Does not pass'} AA {category} text</span></output>
      <p className="resource-tool-help">The decision uses the unrounded ratio. This checks one text color pair, not overall accessibility.</p>
    </> : <p className="resource-tool-error" role="status">Enter valid opaque HEX colors in both fields.</p>}
    <ToolCopy text={result} />
  </>
}

function UnitConverter() {
  const [value, setValue] = useState('24')
  const [root, setRoot] = useState('16')
  const [direction, setDirection] = useState<'px-to-rem' | 'rem-to-px'>('px-to-rem')
  const result = convertCssUnits(value, root, direction)
  return <>
    <h2>Convert a CSS length</h2><p>Set the root size explicitly. This tool does not inspect or change your website.</p>
    <div className="resource-tool-fields">
      <label className="resource-tool-wide">Direction<select value={direction} onChange={event => setDirection(event.target.value as 'px-to-rem' | 'rem-to-px')}><option value="px-to-rem">Pixels → rem</option><option value="rem-to-px">rem → pixels</option></select></label>
      <label>Value ({direction === 'px-to-rem' ? 'px' : 'rem'})<input type="number" step="any" value={value} onChange={event => setValue(event.target.value)} /></label>
      <label>Root font size (px)<input type="number" step="any" min="0" value={root} onChange={event => setRoot(event.target.value)} aria-invalid={!root.trim() || Number(root) <= 0} /></label>
    </div>
    {result === null ? <p className="resource-tool-error" role="status">Enter finite numbers and a root size greater than zero.</p> : <><output className="resource-tool-result" aria-label="Conversion result" aria-live="polite"><strong>{result}</strong></output><p className="resource-tool-help">At a {root}px root size. Results are rounded to six decimal places.</p></>}
    <ToolCopy text={result ?? ''} />
  </>
}

const initialFeedback: FeedbackFields = {
  target: '/settings/team · invitation form · 390px wide · invalid email',
  observation: 'The error message pushes the Invite button outside the panel.',
  outcome: 'The error wraps and the Invite button remains reachable.',
  constraints: 'Reuse the existing field, error, and spacing patterns. Preserve validation and submission behavior.',
  verification: 'Submit an invalid email at 390px, correct it, and complete an invitation. Check the desktop layout too.',
}
const feedbackLabels: { key: keyof FeedbackFields; label: string }[] = [
  { key: 'target', label: 'Target and context' },
  { key: 'observation', label: 'Observed problem' },
  { key: 'outcome', label: 'Expected outcome' },
  { key: 'constraints', label: 'Preserve and reuse (optional)' },
  { key: 'verification', label: 'Verification steps' },
]

function FeedbackBuilder() {
  const [fields, setFields] = useState(initialFeedback)
  const brief = buildFeedbackBrief(fields)
  return <>
    <h2>Build a feedback brief</h2><p>Replace the fictional example with your own observation. Entries stay on this page.</p>
    <div className="resource-tool-fields">{feedbackLabels.map(({ key, label }) => <label className="resource-tool-wide" key={key}>{label}<textarea value={fields[key]} rows={key === 'target' ? 2 : 3} maxLength={2000} onChange={event => { const value = event.target.value; setFields(current => ({ ...current, [key]: value })) }} /></label>)}</div>
    <h3>Your draft</h3>
    {brief ? <pre className="resource-brief-preview" tabIndex={0} aria-label="Generated feedback brief">{brief}</pre> : <p className="resource-tool-error" role="status">Complete the target, observed problem, expected outcome, and verification steps.</p>}
    <ToolCopy text={brief} label="Copy brief" />
    <p className="resource-tool-help">Review the scope before sharing. This builder does not submit feedback or connect an agent.</p>
  </>
}

function ToolCopy({ text, label = 'Copy result' }: { text: string; label?: string }) {
  const [feedback, setFeedback] = useState({ text: '', kind: 'idle' })
  const status = feedback.text === text ? feedback.kind : 'idle'
  async function copy() {
    try { await navigator.clipboard.writeText(text); setFeedback({ text, kind: 'copied' }) }
    catch { setFeedback({ text, kind: 'error' }) }
  }
  return <div className="resource-tool-copy"><button className="ds-button ds-button-primary" type="button" disabled={!text} onClick={copy}>{status === 'copied' ? 'Copied' : label}</button><span role="status">{status === 'copied' ? 'Copied to clipboard.' : status === 'error' ? 'Couldn’t copy. Select the result or draft to copy it manually.' : ''}</span></div>
}
