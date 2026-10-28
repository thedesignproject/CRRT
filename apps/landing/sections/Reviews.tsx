import './reviews.css'

// Real comments only, quoted verbatim (casing included). Add new ones to the end of the list.
const voices = [
  { handle: '@devonlamond', comment: 'crrt is a very cool idea, the ice skating of feedback friction' },
] as const

/** What people say about CRRT, shown as the comments they are. */
export function Reviews() {
  return (
    <section className="landing-section landing-reviews" aria-label="What people say about CRRT">
      <header className="voices-intro">
        <h2>What people say about CRRT.</h2>
      </header>
      <ul className="voices">
        {voices.map((voice) => (
          <li key={voice.handle}>
            <figure className="voice">
              <figcaption>
                <span className="voice-avatar" aria-hidden="true">{voice.handle.charAt(1).toUpperCase()}</span>
                {voice.handle}
              </figcaption>
              <blockquote>{voice.comment}</blockquote>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}
