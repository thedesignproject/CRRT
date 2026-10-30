import { useState } from 'react'
import { SectionIntro } from '../../../src/design-system'

const questions = [
  ['Do I need to install code?', 'For your own product, the Dashboard gives you the project-specific installation. If you cannot touch the code yet, begin with the Chrome extension on supported pages.'],
  ['Can I start only with Chrome?', 'Yes. Install Chrome, sign in, choose a Cloud project, and mark the page. The feedback continues in the same Dashboard workflow.'],
  ['Does the agent merge changes automatically?', 'No. CRRT packages the context and prepares the handoff. Your team reviews the proposed change before it ships.'],
  ['What is Community?', 'Community is the permanently free, self-hosted edition. You operate the infrastructure and keep full control of the data.'],
  ['How does the Cloud trial work?', 'Pro and Studio include a 14-day trial. A card is required, and you can cancel through billing before renewal.'],
  ['What changes with yearly billing?', 'You receive the same plan limits at an effective $16/month for Pro or $41/month for Studio, billed as $192 or $492 per year.'],
]

export function FAQ() {
  const [activeQuestion, setActiveQuestion] = useState(0)

  return (
    <section className="landing-section landing-faq">
      <SectionIntro title="The practical questions." />
      <div className="landing-faq-panel">
        <div className="landing-faq-list" aria-label="Frequently asked questions">
          {questions.map(([question, answer], index) => (
            <div key={question} className={`landing-faq-item ${activeQuestion === index ? 'is-active' : ''}`}>
              <button
                type="button"
                aria-expanded={activeQuestion === index}
                aria-controls={`landing-faq-answer-${index}`}
                onClick={() => setActiveQuestion(index)}
              >
                <span>{question}</span>
                <i aria-hidden="true">{activeQuestion === index ? '−' : '+'}</i>
              </button>
              <div
                id={`landing-faq-answer-${index}`}
                className="landing-faq-answer"
                role="region"
                aria-label={question}
                hidden={activeQuestion !== index}
              >
                <p>{answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
