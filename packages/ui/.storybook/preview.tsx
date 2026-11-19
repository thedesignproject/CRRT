import { Suspense, lazy } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/styles/globals.css";

/**
 * CRRT feedback widget — the pin-and-comment capture surface, mounted on the
 * running preview so a stakeholder can leave feedback on the component itself.
 *
 * Off unless configured. The decorator is registered only when
 * STORYBOOK_CRRT_PROJECT_ID is set; without it Storybook renders exactly as it
 * did before — no decorator, no widget, no listeners.
 *
 *   STORYBOOK_CRRT_PROJECT_ID   CRRT project public key (required to mount)
 *   STORYBOOK_CRRT_API_BASE     backend base URL (default https://crrt.ai/api)
 *
 * What happens to a comment after it lands: see LOOP.md.
 */
function readEnv(key: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env && process.env[key] != null) {
      return process.env[key];
    }
  } catch {
    /* process not available in this builder */
  }
  // Fallback, mirroring the same helper in CarrotPanel.tsx: the manager and
  // preview bundles surface STORYBOOK_* vars through different mechanisms.
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    if (meta.env && meta.env[key] != null) return meta.env[key];
  } catch {
    /* import.meta.env not available in this builder */
  }
  return undefined;
}

const PROJECT_ID = readEnv("STORYBOOK_CRRT_PROJECT_ID")?.trim() || undefined;
// Treat an empty string as unset (copying .env.example verbatim yields ""),
// so it never overrides the default base URL.
const API_BASE = readEnv("STORYBOOK_CRRT_API_BASE")?.trim() || "https://crrt.ai/api";

// Loaded through a dynamic import so the widget lands in its own chunk: with the
// project id unset the import never runs and the chunk is never fetched, rather
// than shipping inert CRRT code in the preview bundle.
const FeedbackWidget = lazy(() =>
  import("@thedesignproject/crrt").then((m) => ({ default: m.FeedbackWidget }))
);

function crrtDecorator(projectId: string): Decorator {
  return (Story) => (
    <>
      <Story />
      <Suspense fallback={null}>
        <FeedbackWidget projectId={projectId} apiBase={API_BASE} />
      </Suspense>
    </>
  );
}

/** Studio is dark-first; the toolbar flips [data-theme="light"] on the root. */
const themeDecorator: Decorator = (Story, ctx) => {
  const theme = ctx.globals.theme === "light" ? "light" : "dark";
  if (typeof document !== "undefined") {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }
  return <Story />;
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Studio theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "dark", title: "Dark (default)" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "dark" },
  parameters: {
    backgrounds: { disable: true },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Adds the built-in "Code" panel (story source) next to Controls/Actions.
    docs: { codePanel: true },
  },
  decorators: PROJECT_ID ? [themeDecorator, crrtDecorator(PROJECT_ID)] : [themeDecorator],
};

export default preview;
