import { describe, expect, it } from 'vitest'
import { classifyExternalWorkFailure, externalWorkFailureMessage } from './external-work-errors'

describe('classifyExternalWorkFailure', () => {
  it.each([
    [new Error('github_not_connected'), 'not_connected'],
    [new Error('github_installation_revoked'), 'revoked'],
    [Object.assign(new Error('Forbidden'), { status: 403 }), 'forbidden'],
    [Object.assign(new Error('Comment not found'), { status: 404 }), 'missing'],
    [Object.assign(new Error('Could not prepare external work'), { status: 500 }), 'unavailable'],
    [new TypeError('Failed to fetch'), 'unavailable'],
    ['not an error', 'unavailable'],
  ])('classifies %o as %s', (error, failure) => {
    expect(classifyExternalWorkFailure(error)).toBe(failure)
  })
})

describe('externalWorkFailureMessage', () => {
  it('only points people who can connect the tracker at the button', () => {
    expect(externalWorkFailureMessage('not_connected', 'Linear', true)).toBe("Linear isn't connected to this project yet.")
    expect(externalWorkFailureMessage('not_connected', 'Linear', false)).toContain('Ask a project manager')
    expect(externalWorkFailureMessage('revoked', 'GitHub', true)).toBe('GitHub lost access to this project. The app was uninstalled or its access was removed, so connect it again.')
    expect(externalWorkFailureMessage('revoked', 'GitHub', false)).toContain('Ask a project manager to connect it again')
  })
})
