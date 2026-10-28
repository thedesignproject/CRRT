import './reviews.css'

// Keep the real quote verbatim; draft examples are explicitly labelled.
const voices = [
  { handle: '@devonlamond', comment: 'crrt is a very cool idea, the ice skating of feedback friction', example: false },
  { handle: 'Example review 1', comment: 'The screenshot and exact element give my coding agent a much clearer starting point.', example: true },
  { handle: 'Example review 2', comment: 'I can leave the comment where I see the problem, then review the fix in the same flow.', example: true },
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
                <span className="voice-avatar" aria-hidden="true">{voice.example ? 'E' : voice.handle.charAt(1).toUpperCase()}</span>
                {voice.handle}
                {voice.example && <small className="voice-example">Illustrative · not a customer quote</small>}
              </figcaption>
              <blockquote>{voice.comment}</blockquote>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}
