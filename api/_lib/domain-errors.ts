// Safe server-side domain failures shared by API handlers and MCP recovery.
export class RecordError extends Error {
  constructor(public code: string, public status: number, public retryable = false) { super(code) }
}
export class StorybookError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
