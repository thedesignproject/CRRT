// Each production worker gets a fresh, non-persistent sandbox. Publish this
// marker atomically only after its one-shot pass has finished all awaited work.
export const WORKER_COMPLETION_FILE = '/vercel/sandbox/record-worker.complete'
export const WORKER_COMPLETION_CONTENT = 'record-worker-complete-v1\n'
