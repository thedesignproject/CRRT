#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  CliError,
  connectStorybook,
  doctorStorybook,
  parseCliArgs,
} from "./cli-core";

const HELP = `CRRT Pro for Storybook

Usage:
  crrt-storybook connect --code <code> [--api-base <url>] [--config-dir <path>]
  crrt-storybook doctor [--config-dir <path>]
  crrt-storybook --version
`;

async function packageVersion(): Promise<string> {
  const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    version?: string;
  };
  return manifest.version ?? "unknown";
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  const version = await packageVersion();
  if (parsed.command === "version") {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (parsed.command === "doctor") {
    const checks = await doctorStorybook({ configDir: parsed.configDir });
    for (const check of checks) {
      process.stdout.write(`${check.ok ? "✓" : "✕"} ${check.label}: ${check.detail}\n`);
    }
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
    return;
  }
  if (parsed.command !== "connect") return;
  process.stdout.write("Connecting this Storybook to CRRT Pro…\n");
  const result = await connectStorybook({
    ...parsed,
    addonVersion: version,
  });
  process.stdout.write(
    `✓ Storybook connected to CRRT project ${result.projectKey}.\nRestart Storybook to open the CRRT panel.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  process.stderr.write(`CRRT could not connect Storybook: ${message}\n`);
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
});
