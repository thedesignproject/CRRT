import { widgetAuthRecoveryDestination } from '../lib/widget-auth'
import { dashboardAuthSearch } from '../lib/access-review-link'
import { useEffect, useState } from 'react'
import { isAuthSessionMissingError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { asset, route } from '../lib/routes'
import { extensionAuthRecoveryDestination } from '../lib/extension-auth'
import { Spinner } from './primitives'

/**
 * Handles the deep link Supabase sends after a `resetPasswordForEmail`. The
 * link arrives at /reset-password with the recovery tokens in the URL hash
 * — Supabase's auth client picks them up automatically and emits a
 * `PASSWORD_RECOVERY` event, leaving the user transiently authenticated so
 * that `updateUser({ password })` is allowed. On success we kick the user
 * back to /login.
 */
const RECOVERY_ERROR = 'this reset link is invalid or has expired. request a new link to continue.'

export function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const recoveryDestination = extensionAuthRecoveryDestination(window.location.search, window.location.origin)
    ?? widgetAuthRecoveryDestination(window.location.search, window.location.origin)
  const recoverySearch = new URLSearchParams(dashboardAuthSearch(window.location.search))
  if (recoveryDestination) recoverySearch.set('continue', recoveryDestination)
  const forgotUrl = route('/forgot-password') + (recoverySearch.size ? `?${recoverySearch}` : '')
  const signInUrl = recoveryDestination ?? (route('/login') + dashboardAuthSearch(window.location.search))
  const invalidLink = !ready && error !== null

  useEffect(() => {
    let cancelled = false
    function invalidate() {
      if (cancelled) return
      setReady(false)
      setError(RECOVERY_ERROR)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') invalidate()
    })
    // Await the client's URL exchange, including errors that getSession alone
    // cannot expose. An existing session must not mask a failed recovery link.
    async function checkRecovery() {
      try {
        const urlError = new URLSearchParams(window.location.search + '&' + window.location.hash.slice(1))
        if (['error', 'error_code', 'error_description'].some(key => urlError.has(key))) throw new Error(RECOVERY_ERROR)
        const { error: initializationError } = await supabase.auth.initialize()
        if (initializationError) throw initializationError
        // Successful exchanges remove their URL credentials. Leftover callback
        // parameters indicate an unsupported or incomplete link, even if a
        // different account already has a session in this browser.
        if (new URLSearchParams(window.location.search).has('code') || window.location.hash) throw new Error(RECOVERY_ERROR)
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!data.session) throw new Error(RECOVERY_ERROR)
        if (cancelled) return
        setError(null)
        setReady(true)
      } catch {
        invalidate()
      }
    }
    // Slow or stalled initialization never enables an unauthenticated form.
    const timeout = window.setTimeout(invalidate, 15000)
    void checkRecovery().finally(() => window.clearTimeout(timeout))
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setError(null)
    if (password.length < 6) {
      setError('password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError("passwords don't match")
      return
    }
    setBusy(true)
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !data.session) {
        setReady(false)
        setError(RECOVERY_ERROR)
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setDone(true)
      // Sign out so the next visit lands on /login cleanly with the new
      // password active.
      await supabase.auth.signOut()
      window.setTimeout(() => {
        window.location.href = extensionAuthRecoveryDestination(window.location.search, window.location.origin) ?? widgetAuthRecoveryDestination(window.location.search, window.location.origin) ?? (route('/login') + dashboardAuthSearch(window.location.search))
      }, 1400)
    } catch (err) {
      if (isAuthSessionMissingError(err)) {
        setReady(false)
        setError(RECOVERY_ERROR)
      } else {
        setError(err instanceof Error ? err.message : 'Could not update password')
      }
    } finally {
      setBusy(false)
    }
  }

  if (done) return <SuccessScreen />

  return (
    <div
      className="scanlines"
      style={{
        minHeight: '100svh',
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 'clamp(40px, 10vh, 120px)',
        paddingBottom: 'clamp(32px, 8vh, 80px)',
        paddingLeft: 'clamp(24px, 7vw, 32px)',
        paddingRight: 'clamp(24px, 7vw, 32px)',
      }}
    >
      {/* Section marker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 'clamp(28px, 6vh, 40px)',
          maxWidth: 420,
          width: '100%',
        }}
      >
        <span className="crrt-section-marker" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>/ 00 reset</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)', minWidth: 12 }} />
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 15,
            letterSpacing: '0.08em',
            color: 'var(--crrt-phosphor)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--crrt-phosphor)',
              animation: 'crrt-pulse 2400ms ease-in-out infinite',
            }}
          />
          {invalidLink ? 'link expired' : 'secure link'}
        </span>
      </div>

      {/* CRRT identity mark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'clamp(24px, 5vh, 36px)' }}>
        <img
          src={asset('crrt-isologo.png')}
          alt=""
          width={40}
          height={40}
          style={{ imageRendering: 'pixelated', width: 'clamp(32px, 8vw, 40px)', height: 'clamp(32px, 8vw, 40px)' }}
        />
        <span
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 'clamp(22px, 5.5vw, 26px)',
            letterSpacing: '0.06em',
            color: 'var(--foreground)',
          }}
        >
          CRRT.
        </span>
      </div>

      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--crrt-font-mono)',
          fontWeight: 700,
          fontSize: 'clamp(26px, 7.5vw, 36px)',
          lineHeight: 1.15,
          letterSpacing: '-0.015em',
          color: 'var(--foreground)',
          textAlign: 'center',
          marginBottom: 12,
          textWrap: 'balance',
        }}
      >
        <span className="crrt-cursor">{invalidLink ? 'link has expired' : 'set a new password'}</span>
      </h1>
      <p
        role={invalidLink ? 'alert' : undefined}
        style={{
          margin: 0,
          fontFamily: 'var(--crrt-font-body)',
          fontSize: 'clamp(14px, 3.5vw, 15px)',
          lineHeight: 1.5,
          color: 'var(--muted-foreground)',
          textAlign: 'center',
          marginBottom: 'clamp(24px, 5vh, 32px)',
          maxWidth: 420,
          textWrap: 'pretty',
        }}
      >
        {invalidLink ? 'request a new link to reset your password.' : ready ? 'choose something you can remember. at least 6 characters.' : 'checking your reset link…'}
      </p>

      {!invalidLink && (<form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          opacity: ready ? 1 : 0.6,
          transition: 'opacity 240ms ease',
        }}
      >
        <FieldLabel htmlFor="reset-password">new password</FieldLabel>
        <AuthInput
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          spellCheck={false}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy || !ready}
        />
        <FieldLabel htmlFor="reset-confirm">confirm</FieldLabel>
        <AuthInput
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          spellCheck={false}
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy || !ready}
        />

        {error && (
          <p
            role="alert"
            aria-live="polite"
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--crrt-font-body)',
              fontSize: 13,
              color: 'var(--status-rejected)',
            }}
          >
            ✗ {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !ready}
          style={{
            marginTop: 16,
            height: 46,
            padding: '0 20px',
            background: busy || !ready ? 'var(--muted)' : 'var(--crrt-carrot)',
            color: busy || !ready ? 'var(--muted-foreground)' : 'var(--crrt-white)',
            border: 'none',
            borderRadius: 999,
            fontFamily: 'var(--crrt-font-mono)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: busy || !ready ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'transform 80ms ease',
          }}
          onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.985)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {busy ? (
            <>
              <Spinner size={14} strokeWidth={3} className="text-current" />
              updating…
            </>
          ) : (
            <>▸ update password</>
          )}
        </button>
      </form>)}

      {invalidLink ? (
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 'var(--crrt-space-4)' }}>
          <a
            href={forgotUrl}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--crrt-space-4) var(--crrt-space-6)',
              borderRadius: 'var(--crrt-radius-pill)',
              background: 'var(--crrt-carrot)', color: 'var(--crrt-white)',
              fontFamily: 'var(--crrt-font-body)', fontSize: 15, fontWeight: 700, textDecoration: 'none',
            }}
          >
            request a new link →
          </a>
          <a
            href={signInUrl}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--crrt-space-4) var(--crrt-space-6)',
              borderRadius: 'var(--crrt-radius-pill)', border: '1px solid var(--border)',
              color: 'var(--foreground)', fontFamily: 'var(--crrt-font-body)', fontSize: 15, textDecoration: 'none',
            }}
          >
            back to sign in
          </a>
        </div>
      ) : (
        <p style={{ marginTop: 28, fontFamily: 'var(--crrt-font-body)', fontSize: 14, color: 'var(--muted-foreground)' }}>
          remembered it?{' '}
          <a href={signInUrl} style={{ color: 'var(--crrt-carrot)', textDecoration: 'none' }}>
            back to sign in →
          </a>
        </p>
      )}
    </div>
  )
}

function SuccessScreen() {
  return (
    <div
      className="scanlines"
      style={{
        minHeight: '100svh',
        background: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 'clamp(40px, 10vh, 120px)',
        paddingLeft: 'clamp(24px, 7vw, 32px)',
        paddingRight: 'clamp(24px, 7vw, 32px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
        <img
          src={asset('crrt-isologo.png')}
          alt=""
          width={40}
          height={40}
          style={{ imageRendering: 'pixelated' }}
        />
        <span
          style={{
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 26,
            letterSpacing: '0.06em',
            color: 'var(--foreground)',
          }}
        >
          CRRT.
        </span>
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--card)',
          padding: 'clamp(20px, 5vw, 28px)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--crrt-font-crt)',
            fontSize: 22,
            letterSpacing: '0.08em',
            color: 'var(--crrt-phosphor)',
            marginBottom: 10,
          }}
        >
          ✓ password updated
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--crrt-font-body)',
            fontSize: 15,
            lineHeight: 1.55,
            color: 'var(--muted-foreground)',
          }}
        >
          you'll be redirected to sign in in a moment…
        </p>
      </div>
    </div>
  )
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontFamily: 'var(--crrt-font-mono)',
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted-foreground)',
      }}
    >
      {children}
    </label>
  )
}

function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        height: 48,
        padding: '0 16px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontFamily: 'var(--crrt-font-body)',
        fontSize: 16,
        color: 'var(--foreground)',
        outline: 'none',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--crrt-carrot)'
        e.currentTarget.style.boxShadow = '0 0 0 1px var(--crrt-carrot), 0 0 12px rgba(255, 176, 0, 0.18)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )
}
