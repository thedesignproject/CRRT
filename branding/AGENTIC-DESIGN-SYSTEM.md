# Agentic Design System

> **What this is:** a schema and authoring guide for `.meta.ts` files that sit next to each component.
> **Why it exists:** agents read implementation; they cannot infer intent. The meta file is the read-only contract that tells an agent when to use a component, what props it accepts, what tokens it consumes, and how to compose it correctly.
> **Source of truth:** this document for prose, [`crrt/lib/meta.ts`](./crrt/lib/meta.ts) for the TypeScript types.

---

## 1. Why component-level meta?

Without meta, an agent looking at `DropCarrotButton.tsx` sees:
- the function signature
- the JSX
- whatever the imports happen to expose

It does **not** see:

- when to use this component vs. the project's generic `Button`
- which design tokens are bound (so it can't reason about theming)
- the accessibility contract (keyboard, ARIA pattern, focus model)
- what a canonical invocation looks like

So agents:

- pick the wrong component
- pass props that don't exist
- re-implement something that already ships
- skip a11y considerations the component author already worked out

`.meta.ts` closes that gap. It is the **only** file an agent should need to read to use a component correctly.

---

## 2. File layout

```
<component-dir>/
├── DropCarrotButton.tsx          ← implementation
└── DropCarrotButton.meta.ts      ← single named export `meta`
```

**Rules:**

- One `meta` constant per file.
- **No default export.** Default exports break tree-shaking from registries and make symbol search messy.
- File name **must** match the component, suffixed with `.meta.ts`.
- The meta file imports the schema type from a shared `lib/meta.ts`:

```ts
import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  // …
}
```

---

## 3. The schema

The canonical TypeScript definition lives in [`crrt/lib/meta.ts`](./crrt/lib/meta.ts). Reproduced here with prose:

### 3.1 Identity

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | PascalCase. Must match the exported component identifier. |
| `displayName` | `string` | yes | Human-readable label. Spaces allowed. |
| `description` | `string` | yes | **One sentence.** What the component is for. |
| `category` | `'action' \| 'display' \| 'navigation' \| 'feedback' \| 'layout' \| 'overlay'` | yes | Coarse taxonomy for filtering. |
| `status` | `'stable' \| 'beta' \| 'experimental' \| 'deprecated'` | yes | Lifecycle marker. Agents should not auto-pick `experimental` or `deprecated`. |
| `version` | `string` | yes | Semver of the component itself, not the package. |

### 3.2 Usage guidance — the agent's decision input

| Field | Type | Required | Notes |
|---|---|---|---|
| `whenToUse` | `string[]` | yes | Imperative bullets. "Use this when…". Minimum 2 items. |
| `whenNotToUse` | `string[]` | yes | Imperative bullets. "Do NOT use when…". Minimum 1 item — at least the most likely confusable alternative. |
| `semanticTags` | `string[]` | yes | Discovery keywords. Includes synonyms, related concepts, brand terms (e.g. `'fab', 'feedback', 'trigger', 'crrt'`). |

These three fields are what an agent reads first. They are the **search index**.

### 3.3 API

| Field | Type | Required | Notes |
|---|---|---|---|
| `props` | `PropMeta[]` | yes | Every prop exposed by the component, in the order the user is most likely to set them. |
| `events` | `EventMeta[]` | no | Required only for interactive components. |
| `slots` | `SlotMeta[]` | no | Required only when the component accepts named children. |

**`PropMeta`:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | |
| `type` | `string` | yes | The TS type as a literal string (e.g. `"'sm' \| 'md' \| 'lg'"`). Agents parse this to type-check generated code. |
| `required` | `boolean` | yes | |
| `default` | `string` | no | TS literal as a string (e.g. `"'md'"`, `"false"`, `"() => {}"`). |
| `description` | `string` | yes | What setting this prop does. One sentence. |
| `enum` | `string[]` | no | If the type is a string union, list the literal values here for fast lookup. |

**`EventMeta`:** `{ name, payload, description }` — payload is the TS type of the handler argument.

**`SlotMeta`:** `{ name, description, accepts }` — accepts is plain text describing valid content (e.g. `"ReactNode (typically short string)"`).

### 3.4 Design references

| Field | Type | Required | Notes |
|---|---|---|---|
| `tokens` | `string[]` | yes | Every CSS variable the component reads. Agents use this to predict theme impact. |
| `figma` | `{ fileKey, nodeId, variants? }` | no | Where the canonical design lives. `variants` is a `Record<variantName, nodeId>` for state/tone variations. |

### 3.5 Composition

```ts
dependencies: {
  npm?: string[]                  // External packages required at runtime
  internal?: string[]             // Other components from this DS
  shadcnPrimitives?: string[]     // Specific shadcn/radix primitives
}
```

`internal` lets an agent walk the composition graph (e.g. `FeedbackPanel` composes `FeedbackBadge`, `DropCarrotButton`, `SeeFeedbackPanel`).

### 3.6 Behavior contract

```ts
a11y: {
  role?: string
  keyboard?: Record<string, string>   // key -> what it does
  ariaPattern?: string                // 'button' | 'menu' | 'dialog' | 'disclosure' | …
  notes?: string[]
}

motion?: {
  respectsReducedMotion: boolean
  transitions: string[]               // Plain-English descriptions
}
```

**`keyboard`** is a flat map. Keys are exact key names as DOM `KeyboardEvent.key` returns them (`'Enter'`, `'Space'`, `'Escape'`, `'ArrowDown'`, etc.).

### 3.7 Examples

```ts
examples: ExampleMeta[]   // Min 1, ordered "most canonical first"

interface ExampleMeta {
  name: string          // Human label, e.g. 'Default', 'With count', 'Loading'
  description: string   // One sentence
  code: string          // Self-contained, runnable snippet
}
```

**Order matters.** `examples[0]` is the agent's default invocation template. Subsequent examples are picked when `whenToUse` matches more specifically.

---

## 4. Authoring rules

1. **One sentence for `description`.** If you need a paragraph, write it as a `whenToUse` bullet instead.
2. **`whenToUse` bullets are imperative.** ("Use this when you need…", not "This component is great for…")
3. **`whenNotToUse` must name the alternative.** ("Don't use this when you need X — use `OtherComponent` instead.")
4. **Every token listed in `tokens` must be referenced by the component's stylesheet.** Lints check this.
5. **Every prop in `props` must match the component's actual API.** Lints check this.
6. **Examples must compile.** They are runnable snippets, not pseudocode.
7. **Never leak implementation details into `description`** — say what it does, not how.
8. **Always include `semanticTags`** — synonyms, brand terms, layperson language. Without tags the component is unreachable.

---

## 5. How an agent reads meta

Recommended reading order, given a user request:

```
1. Glob `**/*.meta.ts` and load every meta.
2. Filter out status === 'deprecated' and status === 'experimental'
   unless the user opted in.
3. Score each meta by:
     a. semanticTags overlap with the user's request tokens
     b. category fit
     c. presence of relevant whenToUse bullets
4. Read whenToUse / whenNotToUse on the top 3 candidates to confirm fit.
5. Pick examples[0] as the starting template.
6. Substitute prop values using the `props` type/enum hints.
7. Walk `dependencies.internal` for composition.
8. Add `a11y.keyboard` handlers if generating interactive code from scratch.
```

A correctly authored meta produces deterministic agent behavior. A vague or under-specified meta produces drift.

---

## 6. Quality bar — what reviewers (or lints) check

| Check | What it means |
|---|---|
| Schema validity | Meta passes `ComponentMeta` typecheck. |
| Name parity | `meta.name` matches the exported component identifier. |
| Props parity | Every `props[].name` exists on the component; every component prop appears in `props`. |
| Tokens parity | Every `tokens[]` entry is referenced in the component's stylesheet (CSS, Tailwind arbitrary values, or inline style). |
| Examples compile | Each `examples[].code` snippet parses and resolves against the actual API. |
| Min content | `whenToUse.length >= 2`, `whenNotToUse.length >= 1`, `semanticTags.length >= 3`, `examples.length >= 1`. |
| One-sentence description | Reject if `description` contains `.` followed by content (rough heuristic). |
| No default export | Reject any default-exported meta. |

---

## 7. Example — good vs. weak meta

### 7.1 Good

```ts
import type { ComponentMeta } from '../lib/meta'

export const meta: ComponentMeta = {
  name: 'DropCarrotButton',
  displayName: 'Drop Carrot Button',
  description:
    'Primary action pill that opens the comment composer; uses the canonical pixel-art carrot as its leading icon.',
  category: 'action',
  status: 'beta',
  version: '0.2.0',

  whenToUse: [
    'You need the primary CTA for capturing a new piece of visual feedback.',
    'You want a brand-forward pill button that reads as CTA but not as a system button.',
    'You are composing the expanded state of FeedbackPanel.',
  ],
  whenNotToUse: [
    'You need a generic-purpose button — use the project\'s standard Button instead.',
    'You need a circular trigger; use FeedbackBadge.',
    'You need a destructive action — DropCarrotButton is never destructive.',
  ],
  semanticTags: ['cta', 'button', 'pill', 'carrot', 'primary-action', 'feedback'],

  props: [
    {
      name: 'tone',
      type: "'dark' | 'carrot' | 'phosphor'",
      required: false,
      default: "'dark'",
      enum: ['dark', 'carrot', 'phosphor'],
      description: 'Color treatment. Dark is canonical inside the widget; carrot and phosphor are for marketing surfaces.',
    },
    // …more
  ],

  tokens: ['--crrt-bg-deep', '--crrt-carrot', '--crrt-shadow-pill', '--ring'],

  dependencies: {
    npm: ['react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    internal: [],
  },

  a11y: {
    role: 'button',
    ariaPattern: 'button',
    keyboard: { Enter: 'Activate.', Space: 'Activate.', Tab: 'Move focus.' },
    notes: ['Always renders as <button>; never spread role="button" on a div.'],
  },

  examples: [
    {
      name: 'Default',
      description: 'Canonical dark pill with leading carrot icon.',
      code: `<DropCarrotButton onClick={() => openComposer()} />`,
    },
  ],
}
```

### 7.2 Weak — what not to do

```ts
export default {
  name: 'DropCarrotButton',
  description: 'A button for dropping carrots. Has multiple variants and supports various states including loading, disabled, and three different visual tones. Use anywhere you need a CTA.',
  // ❌ default export
  // ❌ description is multiple sentences
  // ❌ semanticTags missing
  // ❌ whenNotToUse missing
  // ❌ tokens missing
  // ❌ a11y missing
  // ❌ examples missing

  props: [
    { name: 'tone', type: 'string', description: 'The tone.' },
    // ❌ enum not provided for a union type
    // ❌ default missing
    // ❌ description doesn't say what setting it does
  ],
}
```

---

## 8. Roadmap

| | Status |
|---|---|
| Hand-authored meta | **Now** — current state. Author writes meta alongside component. |
| TS-derived props | Future — generate `props[]` from the component's TS prop interface via `ts-morph`. |
| Token lint | Future — fail CI when `tokens` lists a variable the component does not actually reference. |
| Registry endpoint | Future — serve all meta as JSON at `/registry.json` for live agent consumption. |
| MCP server | Future — expose a `find_component(intent)` tool over MCP so agents can query without globbing. |

---

## 9. Cross-references

- TypeScript schema: [`crrt/lib/meta.ts`](./crrt/lib/meta.ts)
- Brand spec that consumes this: [`CRRT-DESIGN-SYSTEM.md`](./CRRT-DESIGN-SYSTEM.md) — see §5 for the CRRT-specific application.
- Live meta files: [`crrt/components/*.meta.ts`](./crrt/components/)
- Component registry index: [`crrt/components/index.ts`](./crrt/components/index.ts) — re-exports each meta as `<componentName>Meta`.
