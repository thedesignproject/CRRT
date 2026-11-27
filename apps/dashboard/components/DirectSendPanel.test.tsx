import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { delivery } from '../hooks/direct-delivery.fixture'
import { DirectSendPanel } from './DirectSendPanel'

const status = () => screen.getByRole('status').textContent

it('sends to the chosen listening terminal', () => {
  const onSend = vi.fn()
  const direct = delivery()
  render(<DirectSendPanel delivery={direct} pending={2} onSend={onSend} />)
  expect(status()).toBe('Sends straight to term l1. Merging and deploying stay with you.')
  expect(screen.getByRole('option', { name: 'term l2 · Offline' })).toBeDisabled()
  fireEvent.change(screen.getByRole('combobox', { name: 'Terminal' }), { target: { value: 'l1' } })
  expect(direct.setDestination).toHaveBeenCalledWith('l1')
  fireEvent.click(screen.getByRole('button', { name: 'Send 2 crrts to term l1' }))
  expect(onSend).toHaveBeenCalledOnce()
})

it('explains every state that blocks a send', () => {
  const view = render(<DirectSendPanel delivery={delivery({ listeners: [], destination: '', online: false, checking: true })} pending={1} onSend={vi.fn()} />)
  expect(status()).toBe('Checking for listening terminals…')
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByRole('button', { name: 'Send 1 crrt' })).toBeDisabled()

  view.rerender(<DirectSendPanel delivery={delivery({ listeners: [], destination: '', online: false })} pending={1} onSend={vi.fn()} />)
  expect(status()).toMatch(/^No terminal is listening/)

  view.rerender(<DirectSendPanel delivery={delivery({ destination: '', online: false, checking: true })} pending={1} onSend={vi.fn()} />)
  expect(status()).toBe('Choose the terminal that should get these comments.')

  view.rerender(<DirectSendPanel delivery={delivery({ destination: 'l2', online: false, error: 'Offline' })} pending={1} onSend={vi.fn()} />)
  expect(status()).toBe('term l2 stopped listening. Reconnect it, or copy the prompt below.')
  expect(screen.getByRole('alert')).toHaveTextContent('Offline')

  view.rerender(<DirectSendPanel delivery={delivery({ busy: true })} pending={1} onSend={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'Terminal' })).toBeDisabled()

  view.rerender(<DirectSendPanel delivery={delivery()} pending={0} onSend={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'All sent' })).toBeDisabled()
})
