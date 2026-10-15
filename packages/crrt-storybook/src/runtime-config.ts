import type { CrrtParameters } from "./types";

// Storybook replaces these exact expressions in the manager bundle. Dynamic
// process.env access cannot carry preset values into the browser.
declare const process: { env: Record<string, string | undefined> };
export function getInjectedCrrtParameters(): CrrtParameters {
  return {
    connectionId: process.env.STORYBOOK_CRRT_CONNECTION_ID,
    projectId: process.env.STORYBOOK_CRRT_PROJECT_KEY,
    apiBase: process.env.STORYBOOK_CRRT_API_BASE,
    dashboardUrl: process.env.STORYBOOK_CRRT_DASHBOARD_URL,
  };
}
