// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { ensureWidgetFonts } from '../components/FeedbackWidget/fonts'

describe('ensureWidgetFonts in node', () => {
  it('does not access browser globals when document is unavailable', () => {
    expect(() => ensureWidgetFonts()).not.toThrow()
  })
})
