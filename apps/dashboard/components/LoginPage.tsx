import { useState } from 'react'

interface LoginPageProps {
  onSignIn: (email: string, password: string) => Promise<string | null>
}

export function LoginPage({ onSignIn }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setBusy(true)
    setError(null)
    const err = await onSignIn(email, password)
    if (err) setError(err)
    setBusy(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--crrt-font-sans)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          padding: '0 24px',
        }}
      >
        {/* Wordmark */}
        <div style={{ marginBottom: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/crrt-isologo.png"
            alt="CRRT"
            style={{ width: 32, height: 32, imageRendering: 'pixelated' }}
          />
          <span
            style={{
              fontFamily: 'var(--crrt-font-crt)',
              fontSize: 22,
              letterSpacing: '0.08em',
              color: 'var(--foreground)',
            }}
          >
            CRRT.
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--crrt-font-sans)',
            }}
          >
            dashboard
          </span>
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 8,
            letterSpacing: '-0.02em',
          }}
        >
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 28 }}>
          Reviewer access only.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--crrt-radius-md)',
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--foreground)',
                outline: 'none',
                transition: 'border-color 150ms',
                fontFamily: 'var(--crrt-font-sans)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--crrt-carrot)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--crrt-radius-md)',
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--foreground)',
                outline: 'none',
                transition: 'border-color 150ms',
                fontFamily: 'var(--crrt-font-sans)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--crrt-carrot)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </label>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--crrt-carrot-deep)', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            style={{
              marginTop: 8,
              padding: '11px 0',
              background: busy || !email || !password ? 'var(--muted)' : 'var(--crrt-carrot)',
              color: busy || !email || !password ? 'var(--muted-foreground)' : 'var(--crrt-bg-deep)',
              border: 'none',
              borderRadius: 'var(--crrt-radius-md)',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy || !email || !password ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--crrt-font-sans)',
              transition: 'background 150ms, color 150ms',
              letterSpacing: '0.02em',
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
