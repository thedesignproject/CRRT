# CRRT.AI — Logo Manifest

The canonical mark is **one asset**: a pixel-art carrot on a black circular ground. Variants in this manifest are stylistic/contextual exports — they do **not** replace the canonical mark in product UI.

- **Canonical asset (in repo):** [`../../design-system-crrt/Frame 11.png`](../../design-system-crrt/Frame%2011.png)
- **Figma file:** `j6Wuz9emfjcvlTvzGg1ADB` (feedback-widget)
- **Figma parent node:** `22:793` → https://www.figma.com/design/j6Wuz9emfjcvlTvzGg1ADB/feedback-widget?node-id=22-793

## How to extract exact node IDs per variant

The per-variant Figma node IDs below are placeholders (`TBD`). Fill them by running the Figma MCP against the parent node:

```
mcp__figma__get_design_context fileKey=j6Wuz9emfjcvlTvzGg1ADB nodeId=22:793
```

The response includes nested node metadata — match each child by the variant name in the table below and update the `Node ID` column.

## Variants

| # | Variant | Ground | Carrot fill | Ground shape | Use | Node ID |
|---|---|---|---|---|---|---|
| 01 | Canonical / Default | Tube Black (`#0A0A0A`) | Orange body + green leaves | Circle | **Default** — product UI, app icon, favicon | `TBD` |
| 02 | Canonical / Mono White | Tube Black | Solid white | Circle | Single-color use, embossing, social avatars | `TBD` |
| 03 | Canonical / Mono Outline | Tube Black | White outline only | Circle | Stamp / silhouette contexts | `TBD` |
| 04 | Inverse / Carrot Ground | Carrot (`#E8853D`) | White carrot | Rounded square | Marketing accent moments | `TBD` |
| 05 | Light / Mono Outline | Cream (`#F2EBE0`) | Dark outline | Rounded square | Light-only stationery, print | `TBD` |
| 06 | Light / Mono Filled | Cream | Black fill | Rounded square | Light stationery, signature blocks | `TBD` |
| 07 | Light / Color | Cream | Orange body + green leaves | Rounded square | Print materials | `TBD` |
| 08 | Forest / Color | Forest (`#1F3A2F`) | White carrot | Rounded square | Reserve / holiday / Carrot Express homage | `TBD` |
| 09 | Wordmark / Standard / Cream | Cream | Canonical icon + "CRRT.AI" | Lockup | Light header | `TBD` |
| 10 | Wordmark / Standard / Dark | Black | Canonical icon + "CRRT.AI" | Lockup | Dark header | `TBD` |
| 11 | Wordmark / Pill / Dark | Dark pill | Canonical icon + small "CRRT.AI" | Pill lockup | Compact nav | `TBD` |
| 12 | Wordmark / Plain | Cream | Type only `.CRRT.AI` | Type | Long-form copy beside body type | `TBD` |
| 13 | App icon | Rounded dark square (`12px` radius) | Canonical | Rounded square | iOS / macOS / Android icon | `TBD` |
| 14 | Avatar / Cream | Cream circle | Color carrot | Circle | User-style avatar | `TBD` |
| 15 | Avatar / Forest | Forest circle | White carrot | Circle | Holiday variant | `TBD` |
| 16 | Operational / Default | Transparent | — | Type only `CRRT.>_` | Product surfaces, dev docs, terminal moments. See [`CRRT-DESIGN-SYSTEM.md`](../../CRRT-DESIGN-SYSTEM.md) § 3.5. | `TBD` |
| 17 | Operational / All-mono | Transparent | — | Type only `CRRT.>_`, all-mono variant | Pure terminal contexts only | `TBD` |
| 18 | Operational / Animated | Transparent | — | Type only `CRRT.>_` with blinking cursor | Marketing hero, landing, animated identity | `TBD` |

## Export targets

When the IDs above are filled in, export each variant at the following sizes:

| Size | Format | Use |
|---|---|---|
| 16, 32, 48 | PNG | Favicon, browser tab |
| 64, 128, 256, 512 | PNG | App icons (iOS / macOS / Android) |
| 1024 | PNG | App store, social avatar |
| — | SVG | Print, Wordmark lockups (Inter wordmark stays outline-text in source) |

Place exports under `branding/crrt/logos/<variant-num>/<size>.png` once produced. The canonical mark already lives at the asset path documented in [`../../CRRT-DESIGN-SYSTEM.md`](../../CRRT-DESIGN-SYSTEM.md).

## Hard rules

1. **Never re-draw the carrot in SVG paths.** Pixel-art rendered through SVG paths drifts off-pixel at non-integer scales. Always export from the source PNG using nearest-neighbor scaling.
2. **Never enlarge `.AI`** in the wordmark — it is always smaller or lighter than `CRRT`.
3. **The black circular ground is integral to the canonical mark.** Do not request "logo without background" for production use.
