import { useRef } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
// Preview content only. Replace these fictional testimonials with verified customer quotes before launch.
const reviews = [
  {
    company: 'Northwind',
    mark: 'northwind',
    quote: 'CRRT removes the part where product feedback loses its meaning. Our agent sees the exact screen, the comment, and the decision—so the first fix is usually the right one.',
    initials: 'MC',
    name: 'Maya Chen',
    role: 'Head of Product at Northwind',
  },
  {
    company: 'Formline',
    mark: 'formline',
    quote: 'We stopped rewriting feedback into tickets for engineering. CRRT carries the context into the tools we already use and gives us something concrete to review.',
    initials: 'JB',
    name: 'Jon Bell',
    role: 'Founder at Formline',
  },
] as const

export function Reviews() {
  const track = useRef<HTMLDivElement>(null)
  const move = (direction: number) => {
    const element = track.current!
    element.scrollBy({ left: direction * element.clientWidth * .72, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  return (
    <section className="landing-section landing-reviews" aria-label="Customer reviews" data-placeholder-content="true">
      <header className="landing-reviews-intro">
        <div>
          <span>Customer stories · Illustrative placeholders</span>
          <h2>Less translation. More shipped fixes.</h2>
        </div>
        <div className="review-controls"><button type="button" aria-label="Previous review" onClick={() => move(-1)}><ArrowLeft size={18} /></button><button type="button" aria-label="Next review" onClick={() => move(1)}><ArrowRight size={18} /></button></div>
      </header>
      <div className="landing-reviews-grid" ref={track} tabIndex={0} role="group" aria-label="Customer review carousel">
        {reviews.map((review) => (
          <figure className="landing-review" key={review.name}>
            <div className={`landing-review-brand is-${review.mark}`} aria-label={review.company}>
              <i aria-hidden="true" />
              <strong>{review.company}</strong>
            </div>
            <blockquote>“{review.quote}”</blockquote>
            <figcaption>
              <span className="landing-review-avatar" aria-hidden="true">{review.initials}</span>
              <span><strong>{review.name}</strong><small>{review.role}</small></span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
