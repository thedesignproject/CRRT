import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  // Use the package name so Storybook discovers both public addon exports:
  // `./manager` renders the panel and `./preset` injects connection metadata.
  addons: ["@thedesignproject/crrt-storybook"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
