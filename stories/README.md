# CRRT Storybook

The root Storybook documents CRRT dashboard components, built from the
[CRRT – Design System](https://www.figma.com/design/XhbjDqvQOTiVzWk5vAsJdF/CRRT---Design-System)
Figma file. Components so far:

- **Button** (`apps/dashboard/components/Button.tsx`): a **Docs** page with the
  prop table and stories, and a **Usage** page (`Button.mdx`) with rules and
  common mistakes.

Use Node 20.19+ or 22.12+ (Node 24 is supported) and Bun 1.4+:

```sh
bun install
bun run storybook
```

Open http://127.0.0.1:6006. To check types or create a static build:

```sh
bun run typecheck:storybook
bun run build-storybook
```

The static output is `storybook-static/` and is ignored by Git.

## Adding components

- Add `ComponentName.stories.tsx` under `stories/`, using `Meta` and `StoryObj`
  from `@storybook/react-vite`. Import the selected component from its existing
  implementation rather than duplicating it.
- Add documentation as `.mdx` files in this directory. Autodocs is enabled for
  future component stories, alongside Controls and the accessibility panel.
- The theme toolbar sets `data-theme="dark"` or `data-theme="light"`, defaulting
  to dark. `preview.tsx` loads the dashboard style stack (`tokens.css`,
  `apps/dashboard/globals.css`, Figtree), so dashboard Tailwind classes render
  as they do in the app.
- Prop tables come from TypeScript and JSDoc (`react-docgen-typescript`, using
  `tsconfig.check.json`). Document every prop with a JSDoc comment.
- Put a JSDoc comment above each story; it becomes that story's description.
  Counter-examples for MDX pages use `tags: ['!dev', '!autodocs']`.
- Use per-story decorators for any providers and fixtures the component needs.
  Configure public assets via `staticDirs` when needed, and keep dashboard
  links/assets using the existing `route()` and `asset()` helpers.

Configuration lives in `.storybook/`. Its dedicated Vite configuration enables
Tailwind without inheriting the widget's library build, dashboard deployment
paths, or local `.env` files. It does not start an API or require Supabase.

The independently maintained addon playground in `packages/crrt-storybook/`
continues to use its own configuration and port 6007.

## Official documentation

- [React with Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite)
- [Vite configuration](https://storybook.js.org/docs/builders/vite)
- [Writing stories](https://storybook.js.org/docs/writing-stories)
- [Automatic documentation](https://storybook.js.org/docs/writing-docs/autodocs)
- [Themes](https://storybook.js.org/docs/essentials/themes)
