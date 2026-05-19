# CRRT.AI — Design System

> **Status:** v0.2 / WIP — derived from `branding/design-system-crrt/index.html` and the canonical Figma file.
> **Source of truth:** this document. The HTML reference is the visual checkpoint; this `.md` is what implementations must conform to.
> **Theme:** Dark-first. Light theme is opt-in via `[data-theme="light"]`.
> **Implementation base:** shadcn/ui patterns + Tailwind CSS.

---

## 1. Concept

CRRT.AI is a visual feedback widget. The brand operates as **pixel-CRT** — a pixel-art carrot rendered on a black ground, paired with a clean geometric sans wordmark.

**Why pixel-art:** CRRT and CRT (cathode-ray tube) share an alphabet. The carrot in pixels is what the carrot looked like on the screens that invented the pixel.

### Three brand rules

1. **Pixel-art is contained.** The pixel grid lives only in the carrot icon. The wordmark stays in clean Inter sans. Pixel-everything turns the brand into a video game; pixel-icon + sans-wordmark keeps it tech.
2. **Monochrome by default.** Black, white, cream. Carrot orange and leaf green appear inside the logo. Outside the logo, the system is monochrome with carrot orange as the single accent. No fluorescent neon (except as easter egg).
3. **`.AI` is a TLD, not a slogan.** Treated as a domain suffix — smaller weight, often lighter color. The brand is CRRT; the `.AI` is where you find it.

---

## 2. Tokens

All tokens live in [`branding/crrt/tokens.css`](./crrt/tokens.css). **Never deviate from these values.** If a new token is needed, add it to the source first, then to this document.

### 2.1 Color — raw palette

| Token | Hex | Name | Usage |
|---|---|---|---|
| `--crrt-bg` | `#F2EBE0` | Cream | Light-theme page background |
| `--crrt-bg-card` | `#FFFCF6` | Cream Card | Light-theme card / elevated surfaces |
| `--crrt-bg-warm` | `#EDE3D2` | Warm Cream | Light-theme secondary surfaces, browser chrome |
| `--crrt-bg-deep` | `#0A0A0A` | Tube Black | Logo ground. Dark-theme primary surface |
| `--crrt-bg-deep-soft` | `#181818` | Tube Soft | Dark-theme elevated surfaces, pill backgrounds |
| `--crrt-white` | `#FFFFFF` | Phosphor White | Type on dark grounds, max-contrast text |
| `--crrt-ink` | `#0A0A0A` | Ink | Primary text on light |
| `--crrt-ink-soft` | `#2C2C2C` | Ink Soft | Body text on light |
| `--crrt-ink-mute` | `#6B6560` | Mute | Captions, metadata, secondary text |
| `--crrt-ink-faint` | `#A8A29A` | Faint | Tertiary text, disabled, on-dark muted |
| `--crrt-carrot` | `#E8853D` | Carrot | Primary brand accent. Logo body. Notification dot |
| `--crrt-carrot-deep` | `#B85F1F` | Carrot Deep | Hover, pressed, accent shadow |
| `--crrt-phosphor` | `#FFB000` | Phosphor Amber | CRT moments — terminal copy, eyebrows |
| `--crrt-phosphor-green` | `#33FF33` | Phosphor Green | Easter egg only — retro mode |
| `--crrt-forest` | `#1F3A2F` | Forest | Alternate logo ground. Reserve |
| `--crrt-rule` | `rgba(10,10,10,0.10)` | Rule | 1px hairline dividers (light) |
| `--crrt-rule-strong` | `rgba(10,10,10,0.20)` | Rule Strong | Emphasized borders (light) |
| `--crrt-rule-dark` | `rgba(255,255,255,0.08)` | Rule Dark | Borders on dark grounds |
| `--crrt-rule-dark-strong` | `rgba(255,255,255,0.16)` | Rule Dark Strong | Emphasized borders on dark grounds |

### 2.2 Color — semantic (shadcn mapping)

These map to shadcn's standard variables. **Dark theme** (`:root`) is the default; **light theme** is `[data-theme="light"]`.

| Semantic | Dark value | Light value | Notes |
|---|---|---|---|
| `--background` | `--crrt-bg-deep` | `--crrt-bg` | Page surface |
| `--foreground` | `--crrt-white` | `--crrt-ink` | Primary text |
| `--card` | `--crrt-bg-deep-soft` | `--crrt-bg-card` | Card / elevated surface |
| `--card-foreground` | `--crrt-white` | `--crrt-ink` | Text on cards |
| `--popover` | `--crrt-bg-deep-soft` | `--crrt-bg-card` | Popovers / menus |
| `--popover-foreground` | `--crrt-white` | `--crrt-ink` | |
| `--primary` | `--crrt-carrot` | `--crrt-carrot` | Carrot is brand-stable across themes |
| `--primary-foreground` | `--crrt-white` | `--crrt-white` | Text on carrot |
| `--secondary` | `--crrt-bg-deep` | `--crrt-bg-warm` | Quiet surfaces |
| `--secondary-foreground` | `--crrt-ink-faint` | `--crrt-ink-soft` | |
| `--muted` | `--crrt-bg-deep` | `--crrt-bg-warm` | Muted bg |
| `--muted-foreground` | `--crrt-ink-faint` | `--crrt-ink-mute` | Captions |
| `--accent` | `--crrt-phosphor` | `--crrt-carrot-deep` | Phosphor amber accent (dark) |
| `--accent-foreground` | `--crrt-ink` | `--crrt-white` | |
| `--destructive` | `--crrt-carrot-deep` | `--crrt-carrot-deep` | Reusing carrot-deep — no separate red |
| `--destructive-foreground` | `--crrt-white` | `--crrt-white` | |
| `--border` | `--crrt-rule-dark` | `--crrt-rule` | |
| `--input` | `--crrt-rule-dark-strong` | `--crrt-rule-strong` | |
| `--ring` | `--crrt-carrot` | `--crrt-carrot` | Focus ring |

### 2.3 Typography

Three families. **Never mix them outside their roles.**

| Family | Token | Stack | Role |
|---|---|---|---|
| Inter | `--crrt-font-sans` | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Display, body, UI — everything that isn't pixel-art voice or code |
| JetBrains Mono | `--crrt-font-mono` | `'JetBrains Mono', ui-monospace, monospace` | Code blocks, specs, install commands, hex values |
| VT323 | `--crrt-font-crt` | `'VT323', 'JetBrains Mono', monospace` | CRT voice moments — eyebrows, captions, counts, terminal text |

**Type scale (Inter):**

| Token | Size | Weight | Line height | Letter spacing | Role |
|---|---|---|---|---|---|
| `--crrt-text-display` | `clamp(48px, 7vw, 88px)` | 800 | 1.0 | -0.035em | Hero h1 |
| `--crrt-text-h2` | `clamp(32px, 4vw, 44px)` | 700 | 1.05 | -0.025em | Section titles |
| `--crrt-text-h3` | `28px` | 700 | 1.1 | -0.02em | Subsections |
| `--crrt-text-h4` | `20px` | 700 | 1.2 | -0.01em | Card titles |
| `--crrt-text-body-lg` | `18px` | 400 | 1.6 | normal | Lead paragraphs |
| `--crrt-text-body` | `15px` | 400 | 1.55 | normal | Default body |
| `--crrt-text-caption` | `13px` | 400 | 1.55 | normal | Captions, helper text |

**Type scale (VT323 — CRT voice):**

| Size | Role |
|---|---|
| 32px | Hero terminal lines (`> system_init: ready_to_drop_carrots`) |
| 22px | Body terminal lines, counts in callouts |
| 18px | Section numbers, eyebrows, nav meta |
| 16px | Labels, table keys, footer meta |
| 14px | Tags, micro-meta |

**Type scale (JetBrains Mono — code):**

| Size / Weight | Role |
|---|---|
| 14px / 500 | Install commands |
| 13px / 400 | Inline code, hex values |
| 11px / 400 | Swatch hex chips |

### 2.4 Spacing

8-point grid plus a 2px micro step for pixel-aligned details.

| Token | Px | Common use |
|---|---|---|
| `--crrt-space-0` | 0 | |
| `--crrt-space-1` | 2px | Pixel-art alignment, fine borders |
| `--crrt-space-2` | 4px | Tight icon gaps |
| `--crrt-space-3` | 8px | Default tight gap |
| `--crrt-space-4` | 12px | Inline gaps |
| `--crrt-space-5` | 16px | Default grid gap |
| `--crrt-space-6` | 20px | Section card gap |
| `--crrt-space-7` | 24px | Container padding, widget edge |
| `--crrt-space-8` | 32px | Container outer padding |
| `--crrt-space-9` | 48px | Hero spacing |
| `--crrt-space-10` | 64px | Section internal padding |
| `--crrt-space-11` | 96px | Section vertical rhythm |

### 2.5 Border radius

| Token | Px | Use |
|---|---|---|
| `--crrt-radius-none` | 0 | Pixel-art sprites (preserve pixel edges) |
| `--crrt-radius-sm` | 4px | Code chips, micro-tags |
| `--crrt-radius-md` | 6px | Inputs, browser-url field |
| `--crrt-radius-lg` | 8px | Cards (compact), callouts |
| `--crrt-radius-xl` | 10px | Cards (default) |
| `--crrt-radius-2xl` | 12px | Large surfaces |
| `--crrt-radius-3xl` | 16px | Hero panels, widget container |
| `--crrt-radius-pill` | 999px | All pill buttons, badges, count chips |
| `--crrt-radius-full` | 50% | Circular trigger, avatars |

### 2.6 Elevation

| Token | Value | Use |
|---|---|---|
| `--crrt-shadow-flat` | `none` | Default cards |
| `--crrt-shadow-sm` | `0 4px 12px rgba(10,10,10,0.06)` | Subtle lift on light |
| `--crrt-shadow-md` | `0 12px 40px rgba(10,10,10,0.06)` | Demo containers |
| `--crrt-shadow-pill` | `0 8px 24px rgba(10,10,10,0.18)` | Expanded widget pills |
| `--crrt-shadow-trigger` | `drop-shadow(0 12px 32px rgba(10,10,10,0.32)) drop-shadow(0 4px 8px rgba(10,10,10,0.18))` | Floating trigger (use on `filter:`, not `box-shadow`, because the trigger has transparent corners) |
| `--crrt-shadow-trigger-hover` | `drop-shadow(0 16px 36px rgba(10,10,10,0.42)) drop-shadow(0 4px 12px rgba(10,10,10,0.22))` | Trigger hover |

### 2.7 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--crrt-duration-fast` | 150ms | `ease` | Button color / transform |
| `--crrt-duration-default` | 220ms | `ease` | Panel expand / fade |
| `--crrt-duration-slow` | 320ms | `ease` | Page-level transitions |
| `--crrt-pulse-duration` | 2400ms | `ease-in-out` | Carrot dot pulse |

**Pulse keyframes** (carrot notification dot):

```css
@keyframes crrt-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.6; transform: scale(0.85); }
}
```

### 2.8 Image rendering

Pixel-art images **must** use:

```css
image-rendering: pixelated;
image-rendering: -moz-crisp-edges;
image-rendering: crisp-edges;
```

Apply via the `.crrt-pixelated` utility or token `--crrt-image-rendering`.

---

## 3. Logo system

### 3.1 Canonical mark

The brand is **one asset, one canonical lockup**: a pixel-art carrot on a black circular ground. Diagonal orientation, multi-shade orange body, two-tone green leaves.

- **File:** [`branding/design-system-crrt/Frame 11.png`](./design-system-crrt/Frame%2011.png)
- **Figma file:** `j6Wuz9emfjcvlTvzGg1ADB` (feedback-widget)
- **Figma node (brand assets parent):** `22:793` → https://www.figma.com/design/j6Wuz9emfjcvlTvzGg1ADB/feedback-widget?node-id=22-793

The black circle is integral. It carries its own contrast and works on any ground — **no background-specific variant is required for production use.**

### 3.2 Variants

The image reference shows multiple stylistic variants for marketing / sticker / iconography contexts. All are documented in [`branding/crrt/logos/README.md`](./crrt/logos/README.md). The canonical mark is the only variant used in product UI.

| # | Variant | Ground | Carrot fill | Use |
|---|---|---|---|---|
| 01 | Canonical / Default | Black circle | Orange body + green leaves | Default — product UI, app icon, favicon |
| 02 | Canonical / Mono White | Black circle | Solid white | Single-color use, embossing, social avatars |
| 03 | Canonical / Mono Outline | Black circle | White outline only | Stamp / silhouette contexts |
| 04 | Inverse / Carrot Ground | Carrot orange square | White carrot | Marketing accent moments |
| 05 | Light / Mono Outline | Cream square | Dark outline | Light-only stationery, print |
| 06 | Light / Mono Filled | Cream square | Black fill | Light stationery, signature blocks |
| 07 | Light / Color | Cream square | Orange body + green leaves | Print materials |
| 08 | Forest / Color | Forest green square | White carrot | Reserve / holiday / Carrot Express homage |
| 09 | Wordmark / Standard / Cream | Cream | Canonical lockup + "CRRT.AI" | Light header |
| 10 | Wordmark / Standard / Dark | Black | Canonical lockup + "CRRT.AI" | Dark header |
| 11 | Wordmark / Pill / Dark | Pill on dark | Canonical icon + small "CRRT.AI" | Compact nav |
| 12 | Wordmark / Plain | Cream | Type only ".CRRT.AI" | Long-form copy beside body type |
| 13 | App icon | Rounded square (dark, 12px radius) | Canonical | iOS/macOS/Android icon |
| 14 | Avatar / Cream | Circle, cream | Color carrot | User-style avatar |
| 15 | Avatar / Forest | Circle, forest | White carrot | Holiday variant |

> **Figma node IDs per variant:** Marked TBD in the logos manifest. Extract via the Figma MCP `mcp__figma__get_design_context` against the parent node `22:793`, then fill in the manifest.

### 3.3 Size scale

Pixel-art has an inverse-scale advantage — smaller is sharper.

| Px | Role |
|---|---|
| 240 | Brand hero |
| 160 | Section hero |
| 128 | Logo card |
| 120 | Brand block |
| 64 | App / large UI |
| 56 | Widget trigger (canonical product size) |
| 48 | Lockup, callout |
| 32 | Nav, footer |
| 24 | Inline nav |
| 16 | Favicon (pixels become real screen pixels) |

### 3.5 Operational wordmark — `CRRT.>_`

A second lockup that complements the canonical `CRRT.AI`. Where `.AI` says **where** we live (a domain), `.>_` says **what we do** (an operation). Every glyph is a literal piece of shell/terminal syntax:

| Glyph | Reads as | Meaning for the brand |
|---|---|---|
| `CRRT` | Variable name | The product. |
| `.` | Method access (`obj.method()`) or local exec (`./script`) | "CRRT, do something." |
| `>` | Stream redirect (`cmd > file`) | CRRT redirects feedback **out** — to Claude, to Codex, to wherever. |
| `_` | Terminal cursor | Ready state. Always blinking. |

#### Coexistence with `CRRT.AI`

Both lockups are canonical. **They never appear together in the same lockup.** Use cases split as:

| Lockup | Where |
|---|---|
| `CRRT.AI` | Domain references, legal/footer, marketing material that needs the URL. The TLD register. |
| `CRRT.>_` | Product surfaces, dev docs, terminal moments, hero/CTA, anywhere the operational story matters. |

#### Typography

- `CRRT` — Inter 800. Same weight and tracking as the canonical wordmark.
- `.>_` — **JetBrains Mono** (`--crrt-font-mono`), weight 500. Visually shifts the suffix into the "code register" so it reads as operational, not decorative.
- Optional alternate: all-mono treatment (`CRRT.>_` entirely in JetBrains Mono 500) for pure terminal contexts. **Never use VT323 for `CRRT.>_`** — VT323 is retro voice; `.>_` is modern dev tool.

#### Sizes

| Size | Use |
|---|---|
| 88 px | Hero (landing display) |
| 48 px | Section title or marketing block |
| 32 px | UI / nav |
| 24 px | Inline beside body type |
| 16 px | Footer chip |

#### Spacing

- The `.` has no padding either side — it's tight against `CRRT` and `>`.
- The `>` carries a small breathing space: `0.05em` left, `0.05em` right.
- The `_` sits flush against `>`. No gap.

#### Cursor animation

The `_` is **always rendered as a blinking element**, even at rest.

- Keyframe: `crrt-cursor-blink` (in `tokens.css`)
- Duration: `1060ms` (terminal-standard, 50% duty cycle)
- Easing: step-end (no fade — hard blink)
- Color: same as the surrounding text color (`currentColor`)
- Reduced motion: cursor stays **visible** (no animation), not hidden. Static-on, not static-off.

Implementation:

```css
.crrt-operational .cursor {
  animation: crrt-cursor-blink 1060ms steps(1, end) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .crrt-operational .cursor { animation: none; opacity: 1; }
}
```

#### The 3-step operational flow (marketing)

A narrative built on the same syntax. Use in landing hero, onboarding, README:

| Step | Glyph | Meaning |
|---|---|---|
| 1 | `CRRT --select` | The user clicks an element on the page. |
| 2 | `CRRT --prompt` | The agent generates the instruction. |
| 3 | `CRRT.>_` | The prompt, ready to ship to Claude/Codex. |

This is a **marketing pattern**, not a product API. Do not rename widget methods to match.

#### Hard rules

1. **The `_` always blinks** in animated contexts; static-visible in print and reduced-motion. Never static-invisible (that's a hidden cursor, not a ready cursor).
2. **Never enlarge `_` independently** — it scales with the line, never on its own.
3. **Never colorize `>` or `_` independently** — they inherit text color. The only acceptable color shift is the `>` lifting to `--crrt-carrot` for hover/emphasis.
4. **Don't combine with the canonical pixel-art icon in the same lockup.** The carrot icon belongs with `CRRT.AI`; `CRRT.>_` stands alone as type.
5. **Don't use `CRRT.>_` for the legal/footer URL** — that's `.AI`'s job. Mixing them in a single screen is fine; mixing them in a single string is not.

### 3.6 Wordmark rules (canonical `CRRT.AI`)

1. Canonical icon **always to the left** of the wordmark.
2. Gap between icon and text scales with text size — see lockup table:

| Text size | Icon gap | Icon size |
|---|---|---|
| 56px | 16px | 48px |
| 36px | 14px | 48px |
| 28px | 10px | 36px |
| 22px | 12px | 32px |

3. The `.AI` suffix is **always** visually de-emphasized:
   - Same weight (800), same size → use `--crrt-ink-mute` on light, `--crrt-ink-faint` on dark.
   - Or: smaller size (about 60% of preceding wordmark size), same weight, inherit color.

---

## 4. Voice — the power-up frame

CRRT is a feedback tool, but it operates inside a video-game frame: a pixel-art carrot, on a CRT screen, that you "drop" and "collect." That frame is canon in retro gaming — the carrot has been a power-up item since 8-bit consoles (Sonic, Bugs Bunny, several NES titles). The brand voice says it out loud: **every piece of feedback is a power-up. Every resolved comment levels the product up.**

### 4.1 The tagline system

Three registers, not one phrase. Each has a defined slot — never mix two in the same block.

| Register | Tagline | Where it goes |
|---|---|---|
| **Primary** | `Carrots level up your product.` | Hero, README headline, marketing landing. The canonical declarative. |
| **Action** | `Drop a carrot. Ship a better product.` | Onboarding, CTA blocks, in-product empty states. Mirrors the verb (`Drop a carrot`) already in the UI. |
| **Micro** | `Every carrot is a +1.` | Favicon, footer, tooltip, terminal moments. The score-chip variant. |

### 4.2 Rules

1. **Never combine two registers in one block.** If the primary appears in a hero, the action and the micro do not appear in the same hero. They can appear elsewhere on the page.
2. **The primary is the only register used in long-form headlines.** The action is always a two-beat (period split). The micro is always a single short line.
3. **The action register is the only one allowed inside the widget product surface.** The primary and micro are marketing copy.
4. **Always render `+1` in the same font family as the surrounding text.** The only exception: when the micro tagline runs inside a code/terminal block, the `+1` may shift to JetBrains Mono for added scoreboard feel.
5. **Never tokenize the carrot.** No `Every 🥕 is a +1.`, no `🥕s level up your product.` Emojis read as informal; the brand voice is dev-ops, not Slack-energy.
6. **Never translate the taglines into other languages without sign-off.** The wordplay (`level up`, `ship`, `+1`) is calibrated to dev-tool English. Translations need a separate localization pass.

### 4.3 Hooks for product surfaces

These are **not yet implemented** — they are the surface area where the power-up frame extends from voice into UX. Track as follow-ups, build when the moment is right:

- **`DropCarrotButton`** post-click could fade a `+1` floating upward from the carrot icon.
- **`FeedbackBadge`** dot could occasionally render a sparkle frame (every Nth pulse, not every pulse).
- **Comment resolution** could fire a one-shot "level up" micro-animation (single frame, no sound).
- **Dashboard** could expose `12 carrots collected this build` as a literal scoreboard chip.

Each lock the power-up frame deeper into the product. None are required for the brand voice to land — the voice carries on its own.

## 5. Components

All components live in [`branding/crrt/components/`](./crrt/components/). Each has a sibling `<Component>.meta.ts` file conforming to the Agentic Design System schema in §6.

**Rules common to all components:**

- Default surface is **dark** (`--crrt-bg-deep`).
- Use `cn()` utility (from [`branding/crrt/lib/cn.ts`](./crrt/lib/cn.ts)) for class merging.
- Variants via `class-variance-authority` (`cva`).
- All interactive components are keyboard-focusable with a visible focus ring (`--ring`).
- Motion respects `prefers-reduced-motion`.
- Icons are inline SVGs (no icon-library coupling), or the canonical pixel-art carrot via `<img>` to `Frame 11.png`.

### 4.1 `FeedbackBadge`

A 56×56 circular floating trigger. The face is the canonical pixel-art carrot. A pulsing carrot-orange dot in the top-right indicates unresolved feedback.

**Anatomy:**
- Circular `<button>`, transparent background (the asset carries its ground)
- The canonical carrot image fills the button
- A small (10×10) pulsing dot, top-right, ring of background color to separate it
- `filter: drop-shadow(…)` for elevation (not `box-shadow` — the asset has transparent corners)

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `count` | `number` | — | Unresolved feedback count. When `count > 0` the dot pulses |
| `showIndicator` | `boolean` | `count > 0` | Force-show or hide the dot |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 40 / 56 / 72 px |
| `position` | `'br' \| 'bl' \| 'tr' \| 'tl' \| 'inline'` | `'br'` | When not `inline`, renders as fixed-position FAB with 24px page edge offset |
| `onClick` | `(e) => void` | — | |
| `aria-label` | `string` | `'Open CRRT.AI feedback'` | |
| `asChild` | `boolean` | `false` | Slot pattern (radix) |

**States:**
- Resting: shadow as `--crrt-shadow-trigger`.
- Hover/focus: shadow → `--crrt-shadow-trigger-hover`, `transform: scale(1.06) rotate(-3deg)`.
- Active: `transform: scale(0.98)`.
- With count: dot pulses on `--crrt-pulse-duration`.

### 4.2 `DropCarrotButton`

The primary widget action — a dark pill button that opens the comment composer. Leading icon is the canonical pixel-art carrot (mini, 28px, circular).

**Anatomy:**
- Pill (`border-radius: 999px`), `bg-[--crrt-bg-deep]`, white text.
- 1px border `--crrt-rule-dark`.
- Box shadow `--crrt-shadow-pill`.
- Leading slot: canonical carrot image, 28×28, circular.
- Label: "Drop a carrot" by default, 13px / 500 / Inter.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `children` | `ReactNode` | `'Drop a carrot'` | Button label |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | sm: 32h / md: 44h / lg: 52h |
| `tone` | `'dark' \| 'carrot' \| 'phosphor'` | `'dark'` | Dark is canonical; carrot/phosphor for marketing surfaces |
| `iconPosition` | `'leading' \| 'trailing' \| 'none'` | `'leading'` | |
| `loading` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |
| `asChild` | `boolean` | `false` | |

**States:**
- Hover: `bg-[--crrt-bg-deep-soft]`, `translateX(-2px)`.
- Active: `transform: scale(0.98)`.
- Disabled: 60% opacity, no pointer.
- Loading: spinner replaces leading icon, label dimmed.

### 4.3 `SeeFeedbackPanel`

A pill-button-headed panel that shows the unresolved feedback list with a live count. In its collapsed form it is a pill (visually similar to `DropCarrotButton`) with a list icon and a VT323-styled count chip. In its expanded form it reveals a vertical list panel.

**Anatomy (collapsed):**
- Pill, dark, identical shell to `DropCarrotButton`.
- Leading slot: list icon (3 horizontal bars), inside a 28×28 circle of `rgba(255,255,255,0.08)`.
- Label: "See feedback".
- Trailing slot: count in VT323, 14px, color `--crrt-ink-faint`.

**Anatomy (expanded):**
- Pill remains as header.
- Panel slides down beneath header: dark surface (`--crrt-bg-deep-soft`), `border-radius: 12px`, max-height 480px, scrollable list.
- Each row: 14px padding, 1px hairline divider (`--crrt-rule-dark`), 13px Inter text + VT323 timestamp.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `count` | `number` | — | Required — shown in trailing chip |
| `items` | `FeedbackItem[]` | `[]` | List rendered inside panel |
| `open` | `boolean` | `false` | Controlled open state |
| `onOpenChange` | `(open: boolean) => void` | — | Controlled change |
| `defaultOpen` | `boolean` | `false` | Uncontrolled fallback |
| `emptyLabel` | `string` | `'No feedback yet.'` | Shown when `items.length === 0` |
| `renderItem` | `(item) => ReactNode` | — | Override default row render |
| `align` | `'start' \| 'end'` | `'end'` | Panel alignment relative to pill |

**`FeedbackItem` type:**

```ts
type FeedbackItem = {
  id: string
  body: string
  createdAt: string          // ISO
  status?: 'open' | 'resolved'
  author?: string
  pageUrl?: string
}
```

### 4.4 `FeedbackPanel`

The orchestrating composition. Renders a `FeedbackBadge` as the floating trigger and reveals `DropCarrotButton` + `SeeFeedbackPanel` on hover or focus.

**Anatomy:**
- Fixed-position container, bottom-right (default), 24px page edge offset.
- Trigger (badge) is always visible.
- On hover / focus-within: two pill buttons rise from above the badge with 8px stagger, `--crrt-duration-default` transition.
- Click outside dismisses.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `count` | `number` | `0` | Forwarded to badge + see-feedback pill |
| `items` | `FeedbackItem[]` | `[]` | Forwarded to see-feedback panel |
| `position` | `'br' \| 'bl' \| 'tr' \| 'tl'` | `'br'` | Page corner anchor |
| `offset` | `number` | `24` | Px from page edge |
| `onDrop` | `() => void` | — | `DropCarrotButton` click handler |
| `onOpenFeedback` | `() => void` | — | `SeeFeedbackPanel` open handler |
| `defaultOpen` | `boolean` | `false` | Start in the expanded state |
| `triggerOn` | `'hover' \| 'click'` | `'hover'` | Interaction model |
| `theme` | `'dark' \| 'light' \| 'auto'` | `'auto'` | `auto` follows `[data-theme]` |

**A11y:**
- Trigger is keyboard-focusable; `Enter`/`Space` toggles expansion when `triggerOn="click"`.
- `Tab` from trigger enters the option pills in order: drop → see-feedback.
- `Escape` collapses.
- Expanded options are children of the trigger in DOM order; `aria-expanded` reflects state.

---

## 6. `.meta.ts` — Agentic Design System schema

Every component in `branding/crrt/components/` has a sibling `<Component>.meta.ts` file that exports a single `meta` constant conforming to the `ComponentMeta` schema. Agents read these files to know how, when, and why to use a component.

**This is a cross-reference.** The schema, authoring rules, quality bar, and worked examples live in [`AGENTIC-DESIGN-SYSTEM.md`](./AGENTIC-DESIGN-SYSTEM.md). The TypeScript types live in [`crrt/lib/meta.ts`](./crrt/lib/meta.ts).

What this spec adds on top:

- `figma.fileKey` for every CRRT component must equal `'j6Wuz9emfjcvlTvzGg1ADB'`.
- `figma.nodeId` defaults to the parent brand-assets node `'22:793'`; per-variant node IDs go in `figma.variants` (currently `'TBD'` — see [`crrt/logos/README.md`](./crrt/logos/README.md) for how to fill them).
- `tokens` must reference only variables declared in [`crrt/tokens.css`](./crrt/tokens.css). New tokens get added to `tokens.css` first, then to this spec, then to the component meta.

---

## 7. File layout

```
branding/
├── CRRT-DESIGN-SYSTEM.md          ← this document (source of truth)
├── design-system-crrt/
│   ├── index.html                 ← HTML reference (visual checkpoint)
│   └── Frame 11.png               ← canonical mark asset
├── design-system/
│   └── index.html                 ← (legacy / non-CRRT direction)
├── landing-carrot/
│   └── index.html                 ← (legacy / non-CRRT direction)
└── crrt/
    ├── tokens.css                 ← all CSS variables
    ├── lib/
    │   └── cn.ts                  ← class merge utility
    ├── components/
    │   ├── FeedbackBadge.tsx
    │   ├── FeedbackBadge.meta.ts
    │   ├── DropCarrotButton.tsx
    │   ├── DropCarrotButton.meta.ts
    │   ├── SeeFeedbackPanel.tsx
    │   ├── SeeFeedbackPanel.meta.ts
    │   ├── FeedbackPanel.tsx
    │   └── FeedbackPanel.meta.ts
    └── logos/
        └── README.md              ← variant manifest with Figma node IDs
```

---

## 8. Implementation rules (do not deviate)

1. **Never inline hex values in components.** All color references go through `var(--…)` tokens or Tailwind classes that resolve to them.
2. **Never re-implement the canonical carrot in code.** Use the `Frame 11.png` asset with `image-rendering: pixelated`. Pixel art rendered with SVG paths drifts off-pixel at non-integer scales.
3. **Never combine VT323 with non-CRT roles** (no body copy in VT323).
4. **Never enlarge `.AI`** — it is always smaller or lighter than `CRRT`.
5. **Never replace the carrot orange (`#E8853D`) with a different orange** in widget UI. Marketing surfaces may use the broader brand palette.
6. **Never use box-shadow on the badge trigger** — the asset has transparent corners. Use `filter: drop-shadow(…)`.
7. **Pulse animation must respect `prefers-reduced-motion: reduce`** and degrade to a static dot.
8. **Dark theme is the default.** Light theme is opt-in.
9. **Pixel-art only in the carrot icon.** Wordmark, body, UI — Inter or JetBrains Mono or VT323, never pixel fonts.

---

## 9. Versioning

- This document, the tokens, the canonical asset, and the four components share a single version line.
- Current: **v0.2 / WIP / build_2026.05.11**.
- Breaking token rename → minor bump. Visual redesign of a component → minor bump. Adding a token / prop → patch.
