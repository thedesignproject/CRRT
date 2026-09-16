import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

const dataUse = readFileSync(resolve(process.cwd(), 'apps/extension/store-listing/data-use.md'), 'utf8')
const storePractices = readFileSync(resolve(process.cwd(), 'apps/extension/store-listing/privacy-practices.md'), 'utf8')

it('publishes the implemented extension data inventory and verified contact', () => {
  const initialTitle = document.title
  const view = render(<PrivacyPage />)

  expect(screen.getByRole('heading', { level: 1, name: 'Privacy at CRRT' })).toBeInTheDocument()
  expect(document.title).toBe('Privacy at CRRT — CRRT')
  expect(screen.getByText(/email address, account identifier, authentication session/)).toBeInTheDocument()
  expect(screen.getByText(/does not collect your browsing history in the background/)).toBeInTheDocument()
  expect(screen.getByText(/Page content and screenshots are captured only after your explicit feedback action/)).toBeInTheDocument()
  expect(screen.getByText(/Chrome or its speech service may process the audio/)).toBeInTheDocument()
  expect(screen.getByText(/Private feedback is available only to its creator/)).toBeInTheDocument()
  expect(screen.getByText(/configured model provider to propose editable issue copy/)).toBeInTheDocument()
  expect(screen.getByText(/GitHub, Linear, or Jira receives the fields shown in that draft only after/)).toBeInTheDocument()
  expect(screen.getByText('Supabase').closest('li')).toHaveTextContent(
    'Supabase for authentication, database records, and protected screenshot storage.',
  )
  expect(screen.getByText(/handoff codes expire after five minutes/)).toBeInTheDocument()
  expect(screen.getByText(/short-lived signed URLs/)).toBeInTheDocument()

  const contacts = screen.getAllByRole('link', { name: 'hello@designproject.io' })
  expect(contacts).toHaveLength(2)
  for (const contact of contacts) expect(contact).toHaveAttribute('href', 'mailto:hello@designproject.io')
  expect(screen.getAllByRole('link', { name: 'Support' })).toEqual(
    expect.arrayContaining([expect.objectContaining({ pathname: '/support' })]),
  )
  view.unmount()
  expect(document.title).toBe(initialTitle)
})

it.each([
  ['canonical data-use inventory', dataUse],
  ['Chrome Web Store privacy answers', storePractices],
])('keeps required claims in the %s', (_name, document) => {
  const normalized = document.toLowerCase()
  for (const required of [
    'account email', 'current http(s) url', 'feedback text', 'optional screenshot',
    'speech', 'model provider', 'github', 'linear', 'jira', 'supabase', 'vercel',
    'resend', 'five minutes', '24 hours', 'delete', 'hello@designproject.io',
    'does not collect browsing history in the background', 'sell user data',
    'remote code',
  ]) expect(normalized).toContain(required)

  expect(document).not.toMatch(/\b(?:TODO|TBD|placeholder|coming soon)\b/i)
})
