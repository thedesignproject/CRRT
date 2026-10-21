import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const ADDON_PACKAGE = "@thedesignproject/crrt-storybook";
const DEFAULT_API_BASE = "https://crrt.ai/api";
const CONFIG_FILENAME = "crrt.json";
const MAIN_FILENAMES = [
  "main.ts",
  "main.tsx",
  "main.js",
  "main.mjs",
  "main.cjs",
  "main.mts",
  "main.cts",
];

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

interface PackageManifest {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ProjectInspection {
  packageRoot: string;
  configDir: string;
  mainConfig: string;
  packageManager: PackageManager;
  storybookVersion: string;
}

export interface ConnectionMetadata {
  schemaVersion: 1;
  connectionId: string;
  projectKey: string;
  apiBase: string;
  dashboardUrl: string;
}

export interface ConnectOptions {
  code: string;
  apiBase?: string;
  configDir?: string;
  cwd?: string;
  addonVersion: string;
}

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface ConnectDependencies {
  fetchImpl?: typeof fetch;
  runCommand?: (spec: CommandSpec, cwd: string) => Promise<void>;
}

export interface DoctorCheck {
  label: string;
  ok: boolean;
  detail: string;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    throw new CliError(
      `Could not read ${path}: ${error instanceof Error ? error.message : "invalid JSON"}`,
    );
  }
}

export async function findPackageRoot(start: string): Promise<string> {
  let current = resolve(start);
  while (true) {
    if (await pathExists(join(current, "package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new CliError(
        "No package.json found. Run this command from your Storybook project.",
      );
    }
    current = parent;
  }
}

function packageManagerFromField(value?: string): PackageManager | null {
  const name = value?.split("@")[0];
  return name === "npm" || name === "pnpm" || name === "yarn" || name === "bun"
    ? name
    : null;
}

export async function detectPackageManager(
  packageRoot: string,
  manifest: PackageManifest,
): Promise<PackageManager> {
  const declared = packageManagerFromField(manifest.packageManager);
  if (manifest.packageManager && !declared) {
    throw new CliError(
      `Unsupported packageManager value: ${manifest.packageManager}. Use npm, pnpm, yarn, or bun.`,
    );
  }
  if (declared) return declared;

  const candidates: Array<[PackageManager, string[]]> = [
    ["pnpm", ["pnpm-lock.yaml"]],
    ["yarn", ["yarn.lock"]],
    ["bun", ["bun.lock", "bun.lockb"]],
    ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
  ];
  const found: PackageManager[] = [];
  for (const [manager, files] of candidates) {
    if (
      await Promise.any(
        files.map(async (file) => {
          if (await pathExists(join(packageRoot, file))) return true;
          throw new Error("missing");
        }),
      ).catch(() => false)
    ) {
      found.push(manager);
    }
  }
  if (found.length > 1) {
    throw new CliError(
      `Multiple lockfiles found (${found.join(", ")}). Set packageManager in package.json so CRRT does not guess.`,
    );
  }
  return found[0] ?? "npm";
}

function getDependency(
  manifest: PackageManifest,
  name: string,
): string | undefined {
  return manifest.devDependencies?.[name] ?? manifest.dependencies?.[name];
}

function parseMajor(version: string): number | null {
  const match = version.match(/(?:^|[^\d])(\d+)(?:\.\d+)?/);
  return match ? Number(match[1]) : null;
}

function assertSupportedStorybook(manifest: PackageManifest): string {
  const version =
    getDependency(manifest, "storybook") ??
    Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).find(([name]) => name.startsWith("@storybook/"))?.[1];
  if (!version) {
    throw new CliError(
      "Storybook is not installed. Install Storybook 10 first, then run this command again.",
    );
  }
  if (parseMajor(version) !== 10) {
    throw new CliError(
      `CRRT currently supports Storybook 10. This project declares ${version}.`,
    );
  }

  const dependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const hasReactFramework = [...dependencies].some(
    (name) =>
      name === "@storybook/react" ||
      name.startsWith("@storybook/react-") ||
      name.startsWith("@storybook/nextjs"),
  );
  if (!hasReactFramework) {
    throw new CliError(
      "This first CRRT release supports Storybook 10 with React. No supported React Storybook framework was detected.",
    );
  }
  return version;
}

export async function inspectProject(options: {
  cwd?: string;
  configDir?: string;
} = {}): Promise<ProjectInspection> {
  const packageRoot = await findPackageRoot(options.cwd ?? process.cwd());
  const manifest = await readJson<PackageManifest>(join(packageRoot, "package.json"));
  const packageManager = await detectPackageManager(packageRoot, manifest);
  const storybookVersion = assertSupportedStorybook(manifest);
  const configDir = options.configDir
    ? isAbsolute(options.configDir)
      ? options.configDir
      : resolve(packageRoot, options.configDir)
    : join(packageRoot, ".storybook");
  const mainFiles: string[] = [];
  for (const filename of MAIN_FILENAMES) {
    const candidate = join(configDir, filename);
    if (await pathExists(candidate)) mainFiles.push(candidate);
  }
  if (mainFiles.length === 0) {
    throw new CliError(
      `No Storybook main configuration found in ${relative(packageRoot, configDir) || "."}.`,
    );
  }
  if (mainFiles.length > 1) {
    throw new CliError(
      `Multiple Storybook main files found: ${mainFiles.map((file) => relative(packageRoot, file)).join(", ")}. Keep one before connecting CRRT.`,
    );
  }
  return {
    packageRoot,
    configDir,
    mainConfig: mainFiles[0],
    packageManager,
    storybookVersion,
  };
}

export function addonInstallCommand(
  packageManager: PackageManager,
  configDir: string,
  packageRoot: string,
): CommandSpec {
  const relativeConfig = relative(packageRoot, configDir) || ".storybook";
  const common = [
    "storybook",
    "add",
    ADDON_PACKAGE,
    "--config-dir",
    relativeConfig,
  ];
  switch (packageManager) {
    case "npm":
      return {
        command: "npm",
        args: ["exec", "--", ...common, "--package-manager", "npm"],
      };
    case "pnpm":
      return {
        command: "pnpm",
        args: ["exec", ...common, "--package-manager", "pnpm"],
      };
    case "yarn":
      return {
        command: "yarn",
        args: [...common, "--package-manager", "yarn"],
      };
    case "bun":
      return { command: "bunx", args: common };
  }
}

export async function runInheritedCommand(
  spec: CommandSpec,
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(spec.command, spec.args, { cwd, stdio: "inherit" });
    child.on("error", (error) => reject(new CliError(error.message)));
    child.on("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new CliError(
            signal
              ? `Storybook addon installation stopped by ${signal}.`
              : `Storybook addon installation exited with code ${code ?? "unknown"}.`,
          ),
        );
      }
    });
  });
}

function normalizedApiBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError("The CRRT API URL is invalid.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new CliError("The CRRT API must use HTTPS (HTTP is allowed only locally).");
  }
  return url.toString().replace(/\/+$/, "");
}

async function postJson(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
  redactions: string[] = [],
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CliError(
      `Could not reach CRRT: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    const safeMessage =
      typeof data?.message === "string"
        ? redactions.reduce(
            (message, secret) =>
              secret.length >= 8
                ? message.split(secret).join("[redacted]")
                : message,
            data.message,
          )
        : null;
    throw new CliError(
      safeMessage ??
        (response.status === 401 || response.status === 410
          ? "This connection code is invalid or expired. Generate a new command in CRRT."
          : `CRRT returned ${response.status}.`),
    );
  }
  if (!data) throw new CliError("CRRT returned an invalid response.");
  return data;
}

export async function validatePairingCode(
  apiBase: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const data = await postJson(
    `${normalizedApiBase(apiBase)}/v1/storybook/pairings/validate`,
    { code },
    fetchImpl,
    [code],
  );
  if (data.valid !== true || typeof data.expiresAt !== "string") {
    throw new CliError("This connection code is invalid or expired.");
  }
}

export async function claimPairingCode(
  input: {
    apiBase: string;
    code: string;
    storybookVersion: string;
    addonVersion: string;
    packageManager: PackageManager;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionMetadata> {
  const apiBase = normalizedApiBase(input.apiBase);
  const data = await postJson(
    `${apiBase}/v1/storybook/pairings/claim`,
    {
      code: input.code,
      storybookVersion: input.storybookVersion,
      addonVersion: input.addonVersion,
      packageManager: input.packageManager,
    },
    fetchImpl,
    [input.code],
  );
  const connectionId = data.connectionId;
  const projectKey = data.projectKey;
  const responseApiBase = data.apiBase;
  const dashboardUrl = data.dashboardUrl;
  // Connection ids are generated by Postgres as UUIDs. Keep this validation
  // aligned with the API's z.uuid() contract instead of inventing a CLI-only
  // prefix that the server never returns.
  const connectionIdIsUuid =
    typeof connectionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      connectionId,
    );
  if (
    !connectionIdIsUuid ||
    typeof projectKey !== "string" ||
    typeof responseApiBase !== "string" ||
    typeof dashboardUrl !== "string"
  ) {
    throw new CliError("CRRT returned incomplete connection metadata.");
  }
  return {
    schemaVersion: 1,
    connectionId,
    projectKey,
    apiBase: normalizedApiBase(responseApiBase),
    dashboardUrl: normalizedApiBase(dashboardUrl),
  };
}

export async function writeConnectionConfig(
  configDir: string,
  metadata: ConnectionMetadata,
): Promise<string> {
  await mkdir(configDir, { recursive: true });
  const target = join(configDir, CONFIG_FILENAME);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw new CliError(
      `Could not write ${target}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  return target;
}

export async function connectStorybook(
  options: ConnectOptions,
  dependencies: ConnectDependencies = {},
): Promise<{ inspection: ProjectInspection; configPath: string } & ConnectionMetadata> {
  if (!options.code.trim()) {
    throw new CliError("Missing --code. Copy a fresh command from your CRRT project.");
  }
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const inspection = await inspectProject({
    cwd: options.cwd,
    configDir: options.configDir,
  });
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  await validatePairingCode(apiBase, options.code, fetchImpl);
  const command = addonInstallCommand(
    inspection.packageManager,
    inspection.configDir,
    inspection.packageRoot,
  );
  await (dependencies.runCommand ?? runInheritedCommand)(
    command,
    inspection.packageRoot,
  );
  const metadata = await claimPairingCode(
    {
      apiBase,
      code: options.code,
      storybookVersion: inspection.storybookVersion,
      addonVersion: options.addonVersion,
      packageManager: inspection.packageManager,
    },
    fetchImpl,
  );
  const configPath = await writeConnectionConfig(
    inspection.configDir,
    metadata,
  );
  return { inspection, configPath, ...metadata };
}

export async function doctorStorybook(options: {
  cwd?: string;
  configDir?: string;
} = {}): Promise<DoctorCheck[]> {
  let inspection: ProjectInspection;
  try {
    inspection = await inspectProject(options);
  } catch (error) {
    return [
      {
        label: "Storybook project",
        ok: false,
        detail: error instanceof Error ? error.message : "Project inspection failed.",
      },
    ];
  }
  const manifest = await readJson<PackageManifest>(
    join(inspection.packageRoot, "package.json"),
  );
  const addonInstalled = Boolean(getDependency(manifest, ADDON_PACKAGE));
  const mainSource = await readFile(inspection.mainConfig, "utf8");
  const addonRegistered = mainSource.includes(ADDON_PACKAGE);
  const configPath = join(inspection.configDir, CONFIG_FILENAME);
  let configValid = false;
  let configDetail = "No CRRT connection metadata found.";
  if (await pathExists(configPath)) {
    try {
      const config = await readJson<ConnectionMetadata>(configPath);
      configValid =
        config.schemaVersion === 1 &&
        typeof config.connectionId === "string" &&
        typeof config.projectKey === "string";
      configDetail = configValid
        ? `Connected as ${config.connectionId}.`
        : "Connection metadata is incomplete.";
    } catch (error) {
      configDetail = error instanceof Error ? error.message : "Invalid metadata.";
    }
  }
  return [
    {
      label: "Storybook project",
      ok: true,
      detail: `Storybook ${inspection.storybookVersion} · ${inspection.packageManager}`,
    },
    {
      label: "CRRT package",
      ok: addonInstalled,
      detail: addonInstalled ? "Installed." : `${ADDON_PACKAGE} is not installed.`,
    },
    {
      label: "Storybook registration",
      ok: addonRegistered,
      detail: addonRegistered
        ? `Registered in ${relative(inspection.packageRoot, inspection.mainConfig)}.`
        : "The addon is not registered in the Storybook main config.",
    },
    { label: "CRRT connection", ok: configValid, detail: configDetail },
  ];
}

export function parseCliArgs(args: string[]):
  | { command: "help" | "version" }
  | {
      command: "connect";
      code: string;
      apiBase?: string;
      configDir?: string;
    }
  | { command: "doctor"; configDir?: string } {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { command: "help" };
  }
  if (args.includes("--version") || args.includes("-v")) {
    return { command: "version" };
  }
  const [command, ...rest] = args;
  if (command !== "connect" && command !== "doctor") {
    throw new CliError(`Unknown command: ${command}. Use connect or doctor.`);
  }
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new CliError(`Invalid option near ${flag ?? "the end of the command"}.`);
    }
    if (!new Set(["--code", "--api-base", "--config-dir"]).has(flag)) {
      throw new CliError(`Unknown option: ${flag}.`);
    }
    values.set(flag, value);
  }
  const configDir = values.get("--config-dir");
  if (command === "doctor") {
    if (values.has("--code") || values.has("--api-base")) {
      throw new CliError("doctor accepts only --config-dir.");
    }
    return { command, configDir };
  }
  const code = values.get("--code");
  if (!code) {
    throw new CliError("Missing --code. Copy the full command from your CRRT project.");
  }
  return {
    command,
    code,
    apiBase: values.get("--api-base"),
    configDir,
  };
}
