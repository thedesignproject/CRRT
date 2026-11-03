import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Navigation } from './Navigation'
import { ThemeProvider } from '../../../src/design-system/theme'

it('preserves navigation and its signed-in action while shared routes load independently',()=>{
  const view=render(<ThemeProvider defaultTheme="light"><Navigation authenticated={false}/></ThemeProvider>)
  expect(screen.getByRole('link',{name:'Get started'})).toHaveAttribute('href','http://localhost:5173')
  expect(screen.getByRole('button',{name:'Resources'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Switch to dark mode'}))
  expect(screen.getByRole('button',{name:'Switch to light mode'})).toBeInTheDocument()
  view.rerender(<ThemeProvider defaultTheme="light"><Navigation authenticated/></ThemeProvider>)
  expect(screen.getByRole('link',{name:'Dashboard'})).toHaveAttribute('href','http://localhost:5173')
})
