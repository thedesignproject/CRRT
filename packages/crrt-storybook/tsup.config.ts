import { defineConfig } from "tsup";

// React and react-dom are prebundled in the Storybook manager; the storybook/*
// subpaths resolve to the host's own copy. Bundling any of them would break the
// panel, so everything Storybook provides stays external.
const EXTERNAL = [
  /^react(?:\/.*)?$/,
  /^react-dom(?:\/.*)?$/,
  "storybook",
  /^storybook\//,
];

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    platform: "browser",
    external: EXTERNAL,
  },
  {
    entry: ["src/manager.tsx"],
    // The manager must create elements with Storybook's React instance.
    // Automatic JSX would make Storybook inline a second JSX runtime.
    tsconfig: "tsconfig.manager.json",
    format: ["esm"],
    dts: false,
    clean: false,
    platform: "browser",
    external: EXTERNAL,
  },
  {
    entry: ["src/preset.ts", "src/cli-core.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    platform: "node",
    target: "node20.19",
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    platform: "node",
    target: "node20.19",
  },
]);
