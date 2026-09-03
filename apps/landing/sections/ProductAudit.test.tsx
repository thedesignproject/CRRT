import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProductAudit } from './ProductAudit'
import { LOCAL_AUDIT_URL } from '../product-audit/localAudit'

describe('ProductAudit landing section', () => {
  it('starts the controlled local audit from the landing', () => {
    const onStartAudit = vi.fn()
    render(<ProductAudit onStartAudit={onStartAudit} />)

    fireEvent.click(screen.getByRole('button', { name: /run product audit/i }))

    expect(onStartAudit).toHaveBeenCalledWith(LOCAL_AUDIT_URL)
    expect(screen.getByText(/3 admitted/i)).toBeInTheDocument()
  })

  it('does not pretend to crawl arbitrary URLs in the local build', () => {
    const onStartAudit = vi.fn()
    render(<ProductAudit onStartAudit={onStartAudit} />)

    fireEvent.change(screen.getByLabelText(/product url/i), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /run product audit/i }))

    expect(onStartAudit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/live crawling is not connected/i)
  })
})

