import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ConnectionMetadata } from "./cli-core";

interface PresetOptions {
  configDir?: string;
}

function readConnection(options?: PresetOptions): ConnectionMetadata | null {
  const configDir = options?.configDir
    ? isAbsolute(options.configDir)
      ? options.configDir
      : resolve(process.cwd(), options.configDir)
    : join(process.cwd(), ".storybook");
  try {
    const parsed = JSON.parse(
      readFileSync(join(configDir, "crrt.json"), "utf8"),
    ) as Partial<ConnectionMetadata>;
    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.connectionId !== "string" ||
      typeof parsed.projectKey !== "string" ||
      typeof parsed.apiBase !== "string" ||
      typeof parsed.dashboardUrl !== "string"
    ) {
      return null;
    }
    return parsed as ConnectionMetadata;
  } catch {
    return null;
  }
}

export function env(
  existing: Record<string, string> = {},
  options?: PresetOptions,
): Record<string, string> {
  const connection = readConnection(options);
  if (!connection) return existing;
  return {
    ...existing,
    STORYBOOK_CRRT_CONNECTION_ID: connection.connectionId,
    STORYBOOK_CRRT_PROJECT_KEY: connection.projectKey,
    STORYBOOK_CRRT_API_BASE: connection.apiBase,
    STORYBOOK_CRRT_DASHBOARD_URL: connection.dashboardUrl,
  };
}
