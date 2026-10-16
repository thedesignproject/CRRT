import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CliError,
  addonInstallCommand,
  connectStorybook,
  detectPackageManager,
  doctorStorybook,
  inspectProject,
  parseCliArgs,
  validatePairingCode,
} from "../dist/cli-core.js";

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "crrt-storybook-"));
  const configDir = join(root, ".storybook");
  await mkdir(configDir);
  const manifest = {
    name: "fixture",
    private: true,
    packageManager: options.packageManager ?? "pnpm@10.0.0",
    devDependencies: {
      storybook: options.storybook ?? "^10.4.6",
      "@storybook/react-vite": "^10.4.6",
      ...(options.addonInstalled
        ? { "@thedesignproject/crrt-storybook": "^0.1.0" }
        : {}),
    },
  };
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  await writeFile(
    join(configDir, "main.ts"),
    options.addonRegistered
      ? 'export default { addons: ["@thedesignproject/crrt-storybook"] };'
      : "export default { addons: [] };",
  );
  return root;
}

test("parses the copied connect command", () => {
  assert.deepEqual(
    parseCliArgs([
      "connect",
      "--code",
      "pair_123",
      "--api-base",
      "http://localhost:3210/api",
    ]),
    {
      command: "connect",
      code: "pair_123",
      apiBase: "http://localhost:3210/api",
      configDir: undefined,
    },
  );
  assert.throws(
    () => parseCliArgs(["connect", "--api-base", "https://crrt.ai/api"]),
    /Missing --code/,
  );
});

test("detects an explicit package manager and refuses ambiguous lockfiles", async () => {
  const root = await fixture({ packageManager: "bun@1.3.0" });
  try {
    assert.equal(
      await detectPackageManager(root, { packageManager: "bun@1.3.0" }),
      "bun",
    );
    await writeFile(join(root, "package-lock.json"), "{}");
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9");
    await assert.rejects(
      detectPackageManager(root, {}),
      /Multiple lockfiles found/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts only the supported Storybook 10 + React path", async () => {
  const supported = await fixture();
  const unsupported = await fixture({ storybook: "^9.1.0" });
  try {
    const inspection = await inspectProject({ cwd: supported });
    assert.equal(inspection.packageManager, "pnpm");
    assert.equal(inspection.storybookVersion, "^10.4.6");
    await assert.rejects(
      inspectProject({ cwd: unsupported }),
      /currently supports Storybook 10/,
    );
  } finally {
    await rm(supported, { recursive: true, force: true });
    await rm(unsupported, { recursive: true, force: true });
  }
});

test("builds official Storybook installation commands for each package manager", () => {
  const expected = {
    npm: "npm exec -- storybook add",
    pnpm: "pnpm exec storybook add",
    yarn: "yarn storybook add",
    bun: "bunx storybook add",
  };
  for (const manager of Object.keys(expected)) {
    const command = addonInstallCommand(manager, "/repo/.storybook", "/repo");
    assert.equal(
      [command.command, ...command.args].join(" ").startsWith(expected[manager]),
      true,
    );
    assert.ok(command.args.includes("@thedesignproject/crrt-storybook"));
  }
});

test("connect validates, installs, claims, and writes only public metadata", async () => {
  const root = await fixture();
  const connectionId = "4be13db6-7495-4e68-84e4-21cb765fea96";
  const requests = [];
  const commands = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    if (url.endsWith("/validate")) {
      return Response.json({
        valid: true,
        expiresAt: "2026-10-13T20:00:00.000Z",
      });
    }
    return Response.json({
      connectionId,
      projectKey: "project_demo",
      apiBase: "https://crrt.ai/api",
      dashboardUrl: "https://crrt.ai",
    });
  };
  try {
    const result = await connectStorybook(
      {
        code: "pair_secret",
        apiBase: "https://crrt.ai/api",
        cwd: root,
        addonVersion: "0.1.0",
      },
      {
        fetchImpl,
        runCommand: async (spec, cwd) => commands.push({ spec, cwd }),
      },
    );
    assert.equal(requests.length, 2);
    assert.equal(commands.length, 1);
    assert.equal(result.connectionId, connectionId);
    const stored = JSON.parse(await readFile(result.configPath, "utf8"));
    assert.equal(stored.projectKey, "project_demo");
    assert.equal(stored.code, undefined);
    assert.equal(JSON.stringify(stored).includes("pair_secret"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an invalid code changes no local files", async () => {
  const root = await fixture();
  let commandRan = false;
  try {
    await assert.rejects(
      connectStorybook(
        { code: "expired", cwd: root, addonVersion: "0.1.0" },
        {
          fetchImpl: async () =>
            Response.json({ message: "Code expired" }, { status: 410 }),
          runCommand: async () => {
            commandRan = true;
          },
        },
      ),
      /Code expired/,
    );
    assert.equal(commandRan, false);
    await assert.rejects(readFile(join(root, ".storybook", "crrt.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("server errors cannot echo the one-time code back to the terminal", async () => {
  await assert.rejects(
    validatePairingCode(
      "https://crrt.ai/api",
      "pair_super_secret",
      async () =>
        Response.json(
          { message: "pair_super_secret was already used" },
          { status: 410 },
        ),
    ),
    (error) => {
      assert.equal(error.message.includes("pair_super_secret"), false);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});

test("rejects insecure remote API URLs", async () => {
  await assert.rejects(
    validatePairingCode("http://example.com/api", "pair", async () => {
      throw new Error("should not fetch");
    }),
    /must use HTTPS/,
  );
});

test("doctor reports the installed and connected package", async () => {
  const root = await fixture({ addonInstalled: true, addonRegistered: true });
  await writeFile(
    join(root, ".storybook", "crrt.json"),
    JSON.stringify({
      schemaVersion: 1,
      connectionId: "sbconn_demo",
      projectKey: "project_demo",
      apiBase: "https://crrt.ai/api",
      dashboardUrl: "https://crrt.ai",
    }),
  );
  try {
    const checks = await doctorStorybook({ cwd: root });
    assert.equal(checks.length, 4);
    assert.equal(checks.every((check) => check.ok), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CliError keeps expected failures distinct", () => {
  assert.equal(new CliError("bad input", 2).exitCode, 2);
});
