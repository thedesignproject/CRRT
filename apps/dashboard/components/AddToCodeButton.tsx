import { useCallback, useEffect, useRef, useState } from 'react'
import { buildIntegrationPrompt } from '../lib/format'
import { BotIcon, CheckIcon, CopyIcon } from './icons'

interface AddToCodeButtonProps {
  projectId: string
  apiBase: string
  variant?: 'compact' | 'large'
}

export function AddToCodeButton({ projectId, apiBase, variant = 'compact' }: AddToCodeButtonProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopy = useCallback(async () => {
    const prompt = buildIntegrationPrompt(projectId, apiBase)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Clipboard write failed:', err)
    }
  }, [projectId, apiBase])

  if (variant === 'large') {
    return (
      <div className="w-full max-w-md mx-auto rounded-2xl border border-border bg-card p-6 text-left">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <BotIcon size={15} className="text-primary" />
          </div>
          <p className="text-sm font-bold text-foreground">Add widget to your code</p>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Copy a setup prompt for any AI coding agent. It includes the npm package, mount snippet, and this project's credentials.
        </p>
        <div className="rounded-md bg-muted/60 border border-border px-3 py-2 mb-4 space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="opacity-60 w-[60px] shrink-0">project</span>
            <span className="text-foreground truncate">{projectId}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="opacity-60 w-[60px] shrink-0">apiBase</span>
            <span className="text-foreground truncate">{apiBase}</span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity btn-press"
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          {copied ? 'Copied to clipboard' : 'Copy install prompt'}
        </button>
        <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
          Paste it into your AI coding agent inside the project repo.
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={handleCopy}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-xs font-semibold hover:bg-accent transition-colors btn-press"
      title="Copy a setup prompt for your AI coding agent with this project's credentials"
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {copied ? 'Copied' : 'Add to code'}
    </button>
  )
}
