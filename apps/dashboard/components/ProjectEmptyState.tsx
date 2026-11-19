import { ConnectionStatus, InlineCode, PromptBlock, SetupChecklist, type SetupStep } from '@crrt/ui/crrt'
import { setupPrompt } from '../lib/setup-prompt'

interface ProjectEmptyStateProps {
  /** Project public key, baked into the setup prompt. */
  projectId: string
  /** Opens Settings at the Storybook source. Omitted for people who can't manage the project. */
  onConnectStorybook?: () => void
}

/**
 * Shown in the detail pane while a project has no feedback yet. The app is the one
 * required source; Storybook is an optional extra step, not an alternative to it.
 */
export function ProjectEmptyState({ projectId, onConnectStorybook }: ProjectEmptyStateProps) {
  const steps: SetupStep[] = [
    { id: 'project', label: 'Create the project', done: true },
    { id: 'widget', label: 'Install the widget' },
    { id: 'pin', label: 'Leave the first pin' },
    ...(onConnectStorybook ? [{ id: 'storybook', label: 'Connect Storybook', optional: true, onSelect: onConnectStorybook }] : []),
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-170 flex-col gap-6 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h2 className="text-2xl leading-tight font-semibold tracking-tight text-text-strong">Bring feedback into this project</h2>
          <p className="text-text-body">Paste this into your coding agent. Feedback then lands here with its page and screenshot attached.</p>
        </header>
        <SetupChecklist steps={steps} />
        <PromptBlock
          highlight={[projectId]}
          prompt={setupPrompt(projectId)}
          header={<span className="px-1.5 font-medium text-text-body">Paste this into your coding agent</span>}
        />
        <ConnectionStatus
          state="waiting"
          waitingFor={<>Waiting for the first pin on <InlineCode>{projectId}</InlineCode></>}
          hint="Open your app and click the carrot."
        />
        <p className="text-sm text-text-subtle">
          Need more detail? <a href="/docs/install" target="_blank" rel="noopener noreferrer" className="font-medium text-text-strong hover:underline">Read the install guide →</a>
        </p>
      </div>
    </div>
  )
}
