import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { RecordingMarkLimit } from './recording-mark-limit'
it('explains the annotation cap and disappears after undo frees a slot', () => {
  const view = render(<RecordingMarkLimit count={499} />)
  expect(screen.queryByRole('status')).toBeNull()
  view.rerender(<RecordingMarkLimit count={500} />)
  expect(screen.getByRole('status')).toHaveTextContent('Undo or clear marks to add more. Recording continues.')
  view.rerender(<RecordingMarkLimit count={499} />)
  expect(screen.queryByRole('status')).toBeNull()
  view.rerender(<RecordingMarkLimit count={10} sizeLimited />)
  expect(screen.getByRole('status')).toHaveTextContent('Annotation capacity reached')
  view.rerender(<RecordingMarkLimit count={10} error="Shorten your note" />)
  expect(screen.getByRole('alert')).toHaveTextContent('Shorten your note')
  expect(screen.queryByRole('status')).toBeNull()
})
