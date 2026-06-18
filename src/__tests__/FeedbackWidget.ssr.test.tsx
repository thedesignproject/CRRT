// @vitest-environment node

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FeedbackWidget } from '../components/FeedbackWidget'

describe('FeedbackWidget SSR', () => {
  it('renders without accessing browser globals', () => {
    expect(() => renderToString(
      createElement(FeedbackWidget, { projectId: 'project-test' }),
    )).not.toThrow()
  })
})
