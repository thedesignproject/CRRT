import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { asset, relPath, route } from '../lib/routes'
import { Spinner } from './primitives'

type Mode = 'signin' | 'signup' | 'forgot'

function modeFromPath(pathname: string): Mode {
  if (pathname === '/signup') return 'signup'
  if (pathname === '/forgot-password') return 'forgot'
  return 'signin'
}

type AuthPath = '/login' | '/signup' | '/forgot-password' | '/'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>(() =>
    typeof window === 'undefined' ? 'signin' : modeFromPath(relPath(window.location.pathname)),
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupSent, setSignupSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // Sync mode if the user uses browser back / forward.
  useEffect(() => {
    function onPop() {
      setMode(modeFromPath(relPath(window.location.pathname)))
      setError(null)
      setSignupSent(false)
      setResetSent(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(path: AuthPath) {
    if (relPath(window.location.pathname) === path) return
    window.history.pushState({}, '', route(path))
    setMode(modeFromPath(path))
    setError(null)
    setSignupSent(false)
    setResetSent(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: signinError } = await supabase.auth.signInWithPassword({ email, password })
        if (signinError) throw signinError
        navigate('/')
      } else if (mode === 'signup') {
        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${route('/')}` },
        })
        if (signupError) throw signupError
        setSignupSent(true)
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${route('/reset-password')}`,
        })
        if (resetError) throw resetError
        setResetSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  if (signupSent) return <CheckEmail email={email} variant="signup" onBackToSignIn={() => navigate('/login')} />
  if (resetSent) return <CheckEmail email={email} variant="reset" onBackToSignIn={() => navigate('/login')} />

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

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
        position: 'relative',
      }}
    >
      {/* Section marker — matches landing's "/ 01 hero" grammar */}
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
        <span className="crrt-section-marker" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>/ 00 auth</span>
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
          secure session
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

      {/* Title with terminal cursor */}
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
        <span className="crrt-cursor">
          {isSignup ? 'create your crrt' : isForgot ? 'reset your password' : 'welcome back'}
        </span>
      </h1>
      <p
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
        {isSignup
          ? 'one account. unlimited projects. visual feedback for your team.'
          : isForgot
            ? "enter the email you signed up with. we'll send you a link to set a new password."
            : 'sign in to keep shipping fixes from real feedback.'}
      </p>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <FieldLabel htmlFor="auth-email">email</FieldLabel>
        <AuthInput
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          spellCheck={false}
          placeholder="you@team.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />

        {!isForgot && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
              <FieldLabel htmlFor="auth-password">password</FieldLabel>
              {!isSignup && (
                <a
                  href={route('/forgot-password')}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    navigate('/forgot-password')
                  }}
                  style={{
                    fontFamily: 'var(--crrt-font-body)',
                    fontSize: 13,
                    color: 'var(--muted-foreground)',
                    textDecoration: 'none',
                    transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
                >
                  forgot password? →
                </a>
              )}
            </div>
            <AuthInput
              id="auth-password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={6}
              spellCheck={false}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </>
        )}

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
          disabled={busy}
          style={{
            marginTop: 16,
            height: 46,
            padding: '0 20px',
            background: busy ? 'var(--muted)' : 'var(--crrt-carrot)',
            color: busy ? 'var(--muted-foreground)' : 'var(--crrt-white)',
            border: 'none',
            borderRadius: 999,
            fontFamily: 'var(--crrt-font-mono)',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'transform 80ms ease, opacity 150ms',
          }}
          onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.985)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {busy ? (
            <>
              <Spinner size={14} strokeWidth={3} className="text-current" />
              authenticating…
            </>
          ) : (
            <>▸ {isSignup ? 'create account' : isForgot ? 'send reset link' : 'authenticate'}</>
          )}
        </button>
      </form>

      {/* Mode toggle */}
      <p
        style={{
          marginTop: 28,
          fontFamily: 'var(--crrt-font-body)',
          fontSize: 14,
          color: 'var(--muted-foreground)',
        }}
      >
        {isSignup ? (
          <>
            have an account?{' '}
            <a
              href={route('/login')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                e.preventDefault()
                navigate('/login')
              }}
              style={{ color: 'var(--crrt-carrot)', textDecoration: 'none' }}
            >
              sign in →
            </a>
          </>
        ) : isForgot ? (
          <>
            remembered it?{' '}
            <a
              href={route('/login')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                e.preventDefault()
                navigate('/login')
              }}
              style={{ color: 'var(--crrt-carrot)', textDecoration: 'none' }}
            >
              back to sign in →
            </a>
          </>
        ) : (
          <>
            new here?{' '}
            <a
              href={route('/signup')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                e.preventDefault()
                navigate('/signup')
              }}
              style={{ color: 'var(--crrt-carrot)', textDecoration: 'none' }}
            >
              create an account →
            </a>
          </>
        )}
      </p>
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
        // 16px minimum prevents iOS Safari from auto-zooming on focus.
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

function CheckEmail({
  email,
  variant,
  onBackToSignIn,
}: {
  email: string
  variant: 'signup' | 'reset'
  onBackToSignIn: () => void
}) {
  const heading = variant === 'reset' ? '✓ check your inbox' : '✓ check your email'
  const body =
    variant === 'reset' ? (
      <>
        we sent a password reset link to{' '}
        <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{email}</span>. open it to choose a new password.
      </>
    ) : (
      <>
        we sent a confirmation link to{' '}
        <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{email}</span>. click it, then come back here to sign in.
      </>
    )
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
            fontSize: 'clamp(18px, 5vw, 22px)',
            letterSpacing: '0.08em',
            color: 'var(--crrt-phosphor)',
            marginBottom: 12,
          }}
        >
          {heading}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--crrt-font-body)',
            fontSize: 'clamp(14px, 3.5vw, 15px)',
            lineHeight: 1.55,
            color: 'var(--muted-foreground)',
            marginBottom: 22,
            textWrap: 'pretty',
          }}
        >
          {body}
        </p>
        <button
          type="button"
          onClick={onBackToSignIn}
          style={{
            fontFamily: 'var(--crrt-font-body)',
            fontSize: 14,
            color: 'var(--crrt-carrot)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ← back to sign in
        </button>
      </div>
    </div>
  )
}
