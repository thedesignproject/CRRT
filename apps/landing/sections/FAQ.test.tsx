import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FAQ } from './FAQ'

afterEach(cleanup)

describe('FAQ', () => {
  it('keeps one stable answer region while switching questions', () => {
    render(<FAQ />)

    const faqList = screen.getByLabelText('Frequently asked questions')
    expect(screen.getByRole('region', { name: 'Do I need to install code?' })).toHaveTextContent('Dashboard gives you the project-specific installation')

    fireEvent.click(screen.getByRole('button', { name: /Can I start only with Chrome/i }))

    expect(screen.getByRole('region', { name: 'Can I start only with Chrome?' })).toHaveTextContent('choose a Cloud project')
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.getByLabelText('Frequently asked questions')).toBe(faqList)
  })
})
