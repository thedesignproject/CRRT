import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "crrt-storybook-consumer-"));
const cache = join(root, "npm-cache");
const connectionId = "sbconn_consumer_fixture";
const projectKey = "project_consumer_fixture";
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: cache },
  });

try {
  const packReport = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, npm_config_cache: cache },
      },
    ),
  )[0];
  const tarball = join(root, packReport.filename);

  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "crrt-storybook-consumer-fixture",
        private: true,
        type: "module",
        devDependencies: {
          "@storybook/react-vite": "10.4.6",
          "@vitejs/plugin-react": "6.0.3",
          "@thedesignproject/crrt-storybook": `file:${tarball}`,
          react: "19.2.0",
          "react-dom": "19.2.0",
          storybook: "10.4.6",
          vite: "8.1.3",
        },
      },
      null,
      2,
    )}\n`,
  );
  mkdirSync(join(root, ".storybook"));
  mkdirSync(join(root, "stories"));
  writeFileSync(
    join(root, ".storybook", "main.ts"),
    `import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.tsx"],
  addons: ["@thedesignproject/crrt-storybook"],
  framework: "@storybook/react-vite",
};

export default config;
`,
  );
  writeFileSync(
    join(root, ".storybook", "crrt.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        connectionId,
        projectKey,
        apiBase: "https://crrt.ai/api",
        dashboardUrl: "https://crrt.ai",
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(root, "stories", "Smoke.stories.tsx"),
    `import type { Meta, StoryObj } from "@storybook/react-vite";

function Smoke() {
  return <button type="button">CRRT consumer smoke test</button>;
}

const meta = {
  title: "Smoke/Consumer",
  component: Smoke,
} satisfies Meta<typeof Smoke>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
`,
  );

  run("npm", ["install"]);
  assert.equal(
    JSON.parse(readFileSync(join(root, "node_modules/@thedesignproject/crrt-storybook/package.json"), "utf8")).dependencies?.["html2canvas-pro"],
    undefined,
    "Consumers must use the bundled renderer without a Node 24 dependency",
  );
  run("npm", ["exec", "--", "storybook", "build"]);

  const addonsRoot = join(root, "storybook-static", "sb-addons");
  const managerBundles = readdirSync(addonsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes("crrt-storybook"))
    .map((entry) => join(addonsRoot, entry.name, "manager-bundle.js"));
  assert.equal(
    managerBundles.length,
    1,
    `Expected one CRRT manager bundle, found ${managerBundles.length}`,
  );
  const manager = readFileSync(managerBundles[0], "utf8");
  assert.ok(manager.includes(connectionId), "Connection id was not injected");
  assert.ok(manager.includes(projectKey), "Project key was not injected");
  assert.equal(
    manager.includes("react.transitional.element"),
    false,
    "The addon bundled its own React JSX runtime",
  );
  process.stdout.write("Verified the packed addon in a clean Storybook consumer.\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
