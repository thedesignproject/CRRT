import { useState, type FormEvent } from 'react'
import { PillButton } from '../components/PillButton'
import { useReveal } from '../lib/useReveal'
import { LOCAL_AUDIT_URL, runLocalAudit } from '../product-audit/localAudit'

const localPreviewReport = runLocalAudit()

type ProductAuditProps = {
  onStartAudit?: (url: string) => void
}

export function ProductAudit({ onStartAudit }: ProductAuditProps) {
  const reveal = useReveal<HTMLDivElement>()
  const [url, setUrl] = useState(LOCAL_AUDIT_URL)
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedUrl = url.trim().replace(/\/$/, '')

    if (normalizedUrl !== LOCAL_AUDIT_URL) {
      setError(`Live crawling is not connected in this local build yet. Use ${LOCAL_AUDIT_URL} to run the controlled demo.`)
      return
    }

    setError('')
    if (onStartAudit) {
      onStartAudit(normalizedUrl)
      return
    }
    window.location.assign(`/audit/local?url=${encodeURIComponent(normalizedUrl)}`)
  }

  return (
    <section
      id="audit"
      className="scanlines"
      style={{
        background: 'var(--crrt-bg-deep)',
        padding: '120px 32px',
        borderTop: '1px solid var(--crrt-rule-dark)',
      }}
    >
      <div ref={reveal.ref} className={`mx-auto ${reveal.className}`} style={{ maxWidth: 1120 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <span className="section-marker">/ 04 product audit</span>
          <span style={{ width: 40, height: 1, background: 'var(--crrt-rule-dark)' }} />
          <span className="phosphor-eyebrow">crrt finds the problems</span>
        </div>

        <div className="audit-section-grid">
          <div>
            <h2
              style={{
                fontFamily: 'var(--crrt-font-mono)',
                fontWeight: 700,
                fontSize: 'var(--crrt-text-h2)',
                lineHeight: 'var(--crrt-leading-h2)',
                letterSpacing: 'var(--crrt-tracking-h2)',
                color: 'var(--crrt-white)',
                margin: '0 0 24px',
                maxWidth: 720,
              }}
            >
              You can leave the CRRTs.<br />
              <span style={{ color: 'var(--crrt-carrot)' }}>Or CRRT can find them.</span>
            </h2>
            <p
              style={{
                color: 'var(--crrt-ink-faint)',
                fontSize: 16,
                lineHeight: 1.6,
                margin: '0 0 32px',
                maxWidth: 600,
              }}
            >
              Start with a URL. CRRT explores the product, challenges every candidate, and returns only high-impact findings it can defend.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <label
                htmlFor="audit-url"
                style={{
                  display: 'block',
                  fontFamily: 'var(--crrt-font-crt)',
                  fontSize: 16,
                  letterSpacing: 'var(--crrt-tracking-crt)',
                  color: 'var(--crrt-ink-faint)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                Product URL
              </label>
              <div className="audit-url-form">
                <input
                  id="audit-url"
                  type="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setError('')
                  }}
                  spellCheck={false}
                  aria-describedby="audit-preview-note audit-url-error"
                  style={{
                    minWidth: 0,
                    height: 52,
                    border: '1px solid var(--crrt-rule-dark-strong)',
                    borderRadius: 'var(--crrt-radius-pill)',
                    background: 'var(--crrt-bg-deep-soft)',
                    color: 'var(--crrt-white)',
                    padding: '0 20px',
                    fontFamily: 'var(--crrt-font-mono)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <PillButton type="submit" variant="carrot" size="lg">
                  Run product audit →
                </PillButton>
              </div>
              <p
                id="audit-preview-note"
                style={{ color: 'var(--crrt-ink-mute)', fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}
              >
                Local preview · controlled product fixture · no signup
              </p>
              <p
                id="audit-url-error"
                role="alert"
                style={{ color: 'var(--crrt-carrot)', fontSize: 12, lineHeight: 1.5, margin: error ? '8px 0 0' : 0 }}
              >
                {error}
              </p>
            </form>
          </div>

          <div className="audit-evidence-preview" aria-label="Example verified findings">
            <div className="audit-preview-header">
              <span>LOCAL_AUDIT / VERIFIED</span>
              <span style={{ color: 'var(--crrt-phosphor)' }}>● READY</span>
            </div>
            {localPreviewReport.findings.map((finding, index) => (
              <div className="audit-preview-row" key={finding.id}>
                <span className="audit-preview-index">0{index + 1}</span>
                <div>
                  <strong>{finding.title}</strong>
                  <span>{Math.round(finding.confidence * 100)}% confidence · {finding.evidence.length} evidence signal{finding.evidence.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            ))}
            <div className="audit-preview-footer">
              <span>{localPreviewReport.findings.length} admitted</span>
              <span>{localPreviewReport.evidence.length} observations · no padding</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
