export type ExternalWorkFailure =
  /** The project has no connection for this tracker yet. */
  | 'not_connected'
  /** The person can see the feedback but may not send it to trackers. */
  | 'forbidden'
  /** The feedback no longer exists (deleted, or moved to another project). */
  | 'missing'
  /** Network failure, server error, or anything else worth retrying. */
  | 'unavailable'

/** Sorts a failed "prepare issue" request into a cause the person can act on. */
export function classifyExternalWorkFailure(error: unknown): ExternalWorkFailure {
  if (!(error instanceof Error)) return 'unavailable'
  if (error.message.endsWith('_not_connected')) return 'not_connected'
  const status = (error as Error & { status?: unknown }).status
  if (status === 403) return 'forbidden'
  if (status === 404) return 'missing'
  return 'unavailable'
}

export function externalWorkFailureMessage(failure: ExternalWorkFailure, provider: string, canConnect: boolean) {
  switch (failure) {
    case 'not_connected':
      return canConnect
        ? `${provider} isn't connected to this project yet.`
        : `${provider} isn't connected to this project yet. Ask a project manager to connect it in Project settings.`
    case 'forbidden':
      return `Your project role can't send feedback to ${provider}. Ask a project manager for access.`
    case 'missing':
      return 'This feedback was deleted or moved to another project.'
    case 'unavailable':
      return `Couldn't prepare the ${provider} issue. Try again.`
  }
}
