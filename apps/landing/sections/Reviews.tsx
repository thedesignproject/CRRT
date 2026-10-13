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
  return (
    <section className="landing-section landing-reviews" aria-label="Customer reviews" data-placeholder-content="true">
      <div className="landing-reviews-grid">
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
