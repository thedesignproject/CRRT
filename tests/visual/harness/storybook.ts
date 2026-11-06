const state = new URLSearchParams(location.search).get('state') ?? 'ready'
export const useParameter = () => ({ projectId: 'visual-project', connectionId: state === 'legacy' ? undefined : 'visual-connection', apiBase: '/api', checks: [] })
export const useStorybookState = () => ({ storyId: state === 'no-story' ? null : 'button--primary' })
export const useStorybookApi = () => ({ getCurrentStoryData: () => ({ title: 'Components/Button', name: 'Primary', parameters: {} }) })

export const useChannel = () => {}
