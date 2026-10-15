import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { env } from "../dist/preset.js";

test("preset injects only public CRRT connection metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "crrt-preset-"));
  const configDir = join(root, ".storybook");
  await mkdir(configDir);
  await writeFile(
    join(configDir, "crrt.json"),
    JSON.stringify({
      schemaVersion: 1,
      connectionId: "sbconn_demo",
      projectKey: "project_demo",
      apiBase: "https://crrt.ai/api",
      dashboardUrl: "https://crrt.ai",
      code: "must-not-leak",
    }),
  );
  try {
    const result = env({ EXISTING: "kept" }, { configDir });
    assert.deepEqual(result, {
      EXISTING: "kept",
      STORYBOOK_CRRT_CONNECTION_ID: "sbconn_demo",
      STORYBOOK_CRRT_PROJECT_KEY: "project_demo",
      STORYBOOK_CRRT_API_BASE: "https://crrt.ai/api",
      STORYBOOK_CRRT_DASHBOARD_URL: "https://crrt.ai",
    });
    assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preset preserves existing env when no connection exists", () => {
  assert.deepEqual(env({ EXISTING: "kept" }, { configDir: "/missing" }), {
    EXISTING: "kept",
  });
});
