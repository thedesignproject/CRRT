import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const required = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "README.md",
  "package.json",
  "preset.js",
  "dist/cli.js",
  "dist/cli-core.js",
  "dist/cli-core.d.ts",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/manager.js",
  "dist/preset.js",
  "dist/preset.d.ts",
];
const forbiddenPrefixes = ["src/", "stories/", "storybook-static/", "docs/"];

const cache = mkdtempSync(join(tmpdir(), "crrt-npm-cache-"));
let output;
try {
  output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--ignore-scripts", "--json"],
    {
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: cache },
    },
  );
} finally {
  rmSync(cache, { recursive: true, force: true });
}
const report = JSON.parse(output)[0];
const files = new Set(report.files.map((file) => file.path));

for (const path of required) {
  assert.ok(files.has(path), `Package is missing ${path}`);
}
for (const path of files) {
  assert.equal(
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
    false,
    `Package unexpectedly contains ${path}`,
  );
}
assert.match(readFileSync("dist/cli.js", "utf8"), /^#!\/usr\/bin\/env node/);
assert.ok((statSync("dist/cli.js").mode & 0o111) !== 0, "CLI is not executable");
assert.equal(
  readFileSync("dist/manager.js", "utf8").includes("react/jsx-runtime"),
  false,
  "Manager must use Storybook's React instance instead of bundling a JSX runtime",
);
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(manifest.dependencies?.["html2canvas-pro"], undefined,
  "The browser renderer must not impose its Node engine on addon consumers");
assert.doesNotMatch(readFileSync("dist/manager.js", "utf8"),
  /(?:from\s*|import\s*\()\s*["']html2canvas-pro["']/,
  "The browser renderer must be bundled in the manager");

process.stdout.write(`Verified ${files.size} package files (${report.size} bytes).\n`);
