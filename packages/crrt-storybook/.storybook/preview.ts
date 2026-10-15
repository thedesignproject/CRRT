import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    crrt: {
      // Connection metadata is injected by the preset from .storybook/crrt.json.
    },
  },
};

export default preview;
