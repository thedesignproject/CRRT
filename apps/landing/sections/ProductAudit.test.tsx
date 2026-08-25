import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../shared/product-audit/browser-client', () => ({ createAudit: vi.fn(), getAuditCapabilities: vi.fn() }))
import { createAudit, getAuditCapabilities } from '../../../shared/product-audit/browser-client'
import { ProductAudit } from './ProductAudit'
import { LOCAL_AUDIT_URL } from '../product-audit/localAudit'

describe('ProductAudit landing section', () => {
  it('starts any public URL through the supplied live launcher and prevents double submission', async () => {
    let release = () => {}
    const onStartAudit = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    render(<ProductAudit onStartAudit={onStartAudit} />)
    const input = screen.getByLabelText(/product url/i)
    fireEvent.change(input, { target: { value: 'https://example.com/product' } })
    const button = screen.getByRole('button', { name: /run product audit/i })
    fireEvent.click(button); fireEvent.click(button)
    expect(onStartAudit).toHaveBeenCalledTimes(1)
    expect(onStartAudit).toHaveBeenCalledWith('https://example.com/product')
    expect(button).toBeDisabled()
    release()
    await waitFor(() => expect(button).not.toBeDisabled())
  })

  it('shows validated creation failures and capability-controlled availability', async () => {
    vi.mocked(getAuditCapabilities).mockResolvedValueOnce({ enabled: true, anonymousEnabled: true, authenticatedEnabled: true })
    vi.mocked(createAudit).mockRejectedValueOnce(new Error('Anonymous audit quota exceeded'))
    render(<ProductAudit apiBase="https://api.example/api" />)
    await waitFor(() => expect(getAuditCapabilities).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /run product audit/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anonymous audit quota exceeded')
  })

  it('creates an anonymous audit before navigating to its workspace', async () => {
    vi.mocked(getAuditCapabilities).mockResolvedValueOnce({ enabled: true, anonymousEnabled: true, authenticatedEnabled: true })
    vi.mocked(createAudit).mockResolvedValueOnce({ auditId: '11111111-1111-4111-8111-111111111111', status: 'queued' })
    render(<ProductAudit apiBase="https://api.example/api" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /run product audit/i })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /run product audit/i }))
    await waitFor(() => expect(createAudit).toHaveBeenCalled())
  })

  it('disables creation when the server capability is off', async () => {
    vi.mocked(getAuditCapabilities).mockRejectedValueOnce(new Error('disabled'))
    render(<ProductAudit apiBase="https://api.example/api" />)
    expect(await screen.findByRole('button', { name: /audits unavailable/i })).toBeDisabled()
    expect(screen.getByText(/findings stay Open/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue(LOCAL_AUDIT_URL)).toBeInTheDocument()
  })
})
