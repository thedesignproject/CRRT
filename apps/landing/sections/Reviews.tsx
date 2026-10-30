import './reviews.css'

// Keep the real quote verbatim; example entries are draft content for the local mockup.
const voices = [
  { handle: '@devonlamond', comment: 'crrt is a very cool idea, the ice skating of feedback friction', example: false },
  { handle: 'Sofia Bennett', comment: 'I used to send screenshots with arrows and a long explanation. Now I click the thing I want changed and leave a comment.', example: true },
  { handle: 'Lucas Reed', comment: 'The useful part is what comes after the comment. My agent gets the context, and I can check the fix against what I actually asked for.', example: true },
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
                <span className="voice-avatar" aria-hidden="true">{voice.handle.replace('@', '').charAt(0).toUpperCase()}</span>
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
