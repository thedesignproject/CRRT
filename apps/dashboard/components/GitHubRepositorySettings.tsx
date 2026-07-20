import { useCallback, useEffect, useRef, useState } from 'react'
import {
  connectProjectGitHubRepo,
  disconnectProjectGitHubRepo,
  getGitHubInstallOptions,
  getProjectRepoConfig,
  type GitHubInstallOptions,
  type GitHubRepoConfig,
} from '../api'
import { cn } from '../lib/utils'
import { ExternalLinkIcon } from './icons'
import { Spinner } from './primitives'

type InstalledRepo = { owner: string; name: string; repoUrl: string }

type InstallMessage = {
  type: 'crrt:github-app-install'
  ok: boolean
  projectKey?: string
  installationToken?: string
  repositories?: unknown[]
  githubAccountLogin?: string
  githubAccountType?: 'User' | 'Organization'
}

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-all btn-press disabled:cursor-not-allowed disabled:opacity-50'

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : fallback
  } catch {
    return error.message || fallback
  }
}

function installedRepos(value: unknown[] | undefined): InstalledRepo[] | null {
  if (!value) return null
  const repos = value.filter((repo): repo is InstalledRepo => {
    if (!repo || typeof repo !== 'object') return false
    const candidate = repo as Record<string, unknown>
    return typeof candidate.owner === 'string'
      && typeof candidate.name === 'string'
      && typeof candidate.repoUrl === 'string'
      && candidate.repoUrl.startsWith('https://github.com/')
  })
  return repos.length === value.length ? repos : null
}

function openGitHubPopup(url: string) {
  try {
    if (new URL(url).origin !== 'https://github.com') return null
  } catch {
    return null
  }
  return window.open(url, 'crrt-github-connect', 'popup,width=760,height=760')
}

export function GitHubRepositorySettings({ apiBase, accessToken, projectKey }: {
  apiBase: string
  accessToken: string
  projectKey: string
}) {
  const [config, setConfig] = useState<GitHubRepoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<GitHubInstallOptions | null>(null)
  const [repos, setRepos] = useState<InstalledRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [installationToken, setInstallationToken] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const popup = useRef<Window | null>(null)
  const popupPoll = useRef<number | null>(null)

  const stopPopupPoll = useCallback(() => {
    if (popupPoll.current !== null) window.clearInterval(popupPoll.current)
    popupPoll.current = null
  }, [])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConfig(await getProjectRepoConfig(apiBase, accessToken, projectKey))
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the GitHub connection'))
    } finally {
      setLoading(false)
    }
  }, [apiBase, accessToken, projectKey])

  useEffect(() => { void loadConfig() }, [loadConfig])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== popup.current) return
      const message = event.data as Partial<InstallMessage> | null
      if (!message || message.type !== 'crrt:github-app-install') return
      if (message.ok !== true) {
        stopPopupPoll()
        popup.current = null
        setBusy(false)
        setError('GitHub authorization could not be completed. Please try again.')
        return
      }
      const nextRepos = installedRepos(message.repositories)
      if (
        message.projectKey !== projectKey
        || typeof message.installationToken !== 'string'
        || !nextRepos
      ) return
      stopPopupPoll()
      popup.current = null
      setRepos(nextRepos)
      setSelectedRepo(nextRepos[0]?.repoUrl ?? '')
      setInstallationToken(message.installationToken)
      setAccount(typeof message.githubAccountLogin === 'string' ? message.githubAccountLogin : null)
      setOptions(null)
      setBusy(false)
      setError(nextRepos.length === 0 ? 'This GitHub App installation has no accessible repositories.' : null)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      stopPopupPoll()
    }
  }, [projectKey, stopPopupPoll])

  async function chooseConnection() {
    setBusy(true)
    setError(null)
    setInstallationToken(null)
    setRepos([])
    try {
      setOptions(await getGitHubInstallOptions(apiBase, accessToken, projectKey))
    } catch (err) {
      setError(errorMessage(err, 'Failed to load GitHub accounts'))
    } finally {
      setBusy(false)
    }
  }

  function authorize(url: string) {
    setError(null)
    const nextPopup = openGitHubPopup(url)
    if (!nextPopup) {
      setError('Allow pop-ups for CRRT, then try again.')
      return
    }
    popup.current = nextPopup
    setBusy(true)
    stopPopupPoll()
    popupPoll.current = window.setInterval(() => {
      if (!popup.current?.closed) return
      stopPopupPoll()
      popup.current = null
      setBusy(false)
    }, 500)
  }

  async function connect() {
    if (!installationToken || !selectedRepo) return
    setBusy(true)
    setError(null)
    try {
      const updated = await connectProjectGitHubRepo(apiBase, accessToken, projectKey, selectedRepo, installationToken)
      setConfig(updated)
      setInstallationToken(null)
      setRepos([])
    } catch (err) {
      const message = errorMessage(err, 'Failed to connect the repository')
      try {
        setConfig(await getProjectRepoConfig(apiBase, accessToken, projectKey))
      } catch {
        // Keep the existing config; the original connect error is actionable.
      }
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      setConfig(await disconnectProjectGitHubRepo(apiBase, accessToken, projectKey))
      setConfirmDisconnect(false)
      setOptions(null)
      setInstallationToken(null)
      setRepos([])
    } catch (err) {
      setError(errorMessage(err, 'Failed to disconnect the repository'))
    } finally {
      setBusy(false)
    }
  }

  const status = config?.githubConnectionStatus ?? 'disconnected'

  return (
    <section className="mt-8" aria-labelledby="github-repository-heading">
      <h2 id="github-repository-heading" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">GitHub repository</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">Choose where CRRT will create detailed issues from accepted feedback.</p>
      <div className="mt-3 rounded-lg border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center justify-center py-5" aria-label="Loading GitHub connection"><Spinner size={16} /></div>
        ) : (
          <div className="space-y-4">
            {status !== 'disconnected' && config?.repoUrl && (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a className="inline-flex max-w-full items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-primary" href={config.repoUrl} target="_blank" rel="noreferrer">
                    <span className="truncate">{config.githubOwner}/{config.githubRepo}</span><ExternalLinkIcon size={12} />
                  </a>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {status === 'connected' ? 'Connected and ready for GitHub issues.' : 'Reconnect this legacy repository before creating issues.'}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', status === 'connected' ? 'bg-status-accepted-bg text-status-accepted' : 'bg-primary/15 text-primary')}>
                  {status === 'connected' ? 'Connected' : 'Reconnect required'}
                </span>
              </div>
            )}

            {status === 'disconnected' && !options && !installationToken && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">No repository connected</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Connect GitHub to choose the repository that will receive feedback issues.</p>
                </div>
                <button type="button" disabled={busy} onClick={chooseConnection} className={cn(button, 'w-full bg-primary text-primary-foreground hover:opacity-90 sm:w-auto')}>
                  {busy ? 'Loading…' : 'Connect GitHub'}
                </button>
              </div>
            )}

            {options && !installationToken && (
              <div className="space-y-2">
                {options.installations.map((installation) => (
                  <button key={installation.id} type="button" disabled={busy} onClick={() => authorize(installation.authorizeUrl)} className={cn(button, 'w-full border border-border bg-background text-foreground hover:bg-accent')}>
                    Use {installation.githubAccountType === 'Organization' ? 'organization' : 'account'} @{installation.githubAccountLogin}
                  </button>
                ))}
                <button type="button" disabled={busy} onClick={() => authorize(options.installUrl)} className={cn(button, 'w-full border border-border bg-background text-foreground hover:bg-accent')}>
                  {options.installations.length > 0 ? 'Install for another GitHub account' : 'Install the CRRT GitHub App'}
                </button>
                <button type="button" disabled={busy} onClick={() => setOptions(null)} className="w-full text-[11px] font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            )}

            {installationToken && repos.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="github-repository" className="mb-1 block text-[11px] font-medium text-muted-foreground">Repository{account ? ` · @${account}` : ''}</label>
                  <select id="github-repository" value={selectedRepo} onChange={(event) => setSelectedRepo(event.target.value)} disabled={busy} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20">
                    {repos.map((repo) => <option key={repo.repoUrl} value={repo.repoUrl}>{repo.owner}/{repo.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={busy} onClick={() => { setInstallationToken(null); setRepos([]) }} className={cn(button, 'border border-border text-muted-foreground hover:text-foreground')}>Cancel</button>
                  <button type="button" disabled={busy || !selectedRepo} onClick={connect} className={cn(button, 'bg-primary text-primary-foreground hover:opacity-90')}>{busy ? 'Connecting…' : 'Connect repository'}</button>
                </div>
              </div>
            )}

            {status !== 'disconnected' && !options && !installationToken && !confirmDisconnect && (
              <div className="flex justify-end">
                {status === 'connected' ? (
                  <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(true)} className={cn(button, 'border border-border text-muted-foreground hover:text-status-rejected')}>Disconnect</button>
                ) : (
                  <button type="button" disabled={busy} onClick={chooseConnection} className={cn(button, 'bg-primary text-primary-foreground hover:opacity-90')}>{busy ? 'Loading…' : 'Reconnect GitHub'}</button>
                )}
              </div>
            )}

            {confirmDisconnect && (
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[11px] text-muted-foreground">CRRT will stop creating issues for this project until another repository is connected.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)} className={cn(button, 'border border-border text-foreground')}>Cancel</button>
                  <button type="button" disabled={busy} onClick={disconnect} className={cn(button, 'bg-destructive text-destructive-foreground')}>{busy ? 'Disconnecting…' : 'Disconnect repository'}</button>
                </div>
              </div>
            )}

            {busy && popup.current && <p className="text-center text-[11px] text-muted-foreground" role="status">Complete authorization in the GitHub window…</p>}
            {error && <p className="text-[11px] text-status-rejected" role="alert">{error}</p>}
            {error && !loading && !config && <button type="button" onClick={loadConfig} className="text-[11px] font-semibold text-primary">Retry</button>}
          </div>
        )}
      </div>
    </section>
  )
}
