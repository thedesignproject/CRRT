// lint.mjs — the anti-slop detector (deterministic, no LLM).
//
// Scans component source for violations of the design-system foundations that a
// type-checker can't see: a className is a valid string to TypeScript, but "p-[15px]" or a
// hardcoded hex are slop. Runs as `bun run lint`; wire it into CI so a PR that introduces slop
// fails its check. Rules map to brain/design/foundations/*.
//
// Scoped on purpose: only spacing utilities (p/m/gap/space) are checked for arbitrary
// values — ring/rounded/size arbitrary values are legitimate kit-level styling.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src"
);
const REPO_ROOT = path.resolve(SRC_DIR, "..", "..", "..");
// CRRT: patterns and screens are app-level code, so the anti-slop rules apply in full.
const APP_DIRS = [path.join(SRC_DIR, "crrt"), path.join(SRC_DIR, "screens")];

async function listTsx(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listTsx(full)));
    else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".stories.tsx")) out.push(full);
  }
  return out;
}

/** Line-level rules: regex + a message factory. */
const RULES = [
  {
    id: "foundations/spacing",
    // p/m/gap/space with an arbitrary [..] value → off the scale.
    re: /\b(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy])-\[[^\]]+\]/g,
    message: (m) =>
      `arbitrary spacing "${m}" — use a scale step (Tailwind v4 has fractional steps like p-4.5). See brain/design/DIRECTION.md`,
  },
  {
    id: "foundations/color",
    // Hardcoded hex or rgb() color → not a token.
    re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\brgba?\([^)]*\)/g,
    message: (m) =>
      `hardcoded color "${m}" — use a token (bg-primary, text-muted-foreground…). See brain/design/foundations/color.md`,
  },
];

/** File-level rule: icon-only <Button>/<button> with no accessible label. */
function checkIconButtonA11y(source, file, findings) {
  const re = /<(Button|button)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  for (const m of source.matchAll(re)) {
    const [full, , attrs, inner] = m;
    const hasLabel = /aria-label|aria-labelledby|sr-only/.test(attrs + inner);
    const innerStripped = inner.replace(/\s+/g, "");
    const iconOnly = /^(<[A-Za-z]*Icon\b[^>]*\/>|<Icon\b[^>]*\/>)$/.test(innerStripped);
    if (iconOnly && !hasLabel) {
      const line = source.slice(0, m.index).split("\n").length;
      findings.push({
        file,
        line,
        rule: "quality/a11y",
        message: "icon-only button without an accessible label — add aria-label or sr-only text",
      });
    }
  }
}

async function main() {
  const appFiles = (await Promise.all(APP_DIRS.map(listTsx))).flat().sort();
  const findings = [];
  const linted = [];

  for (const file of appFiles) {
    const source = await fs.readFile(file, "utf8");
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    linted.push(rel);
    source.split("\n").forEach((line, i) => {
      // ignore obvious comment lines to reduce noise
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const rule of RULES) {
        for (const m of line.matchAll(rule.re)) {
          findings.push({ file: rel, line: i + 1, rule: rule.id, message: rule.message(m[0]) });
        }
      }
    });
    checkIconButtonA11y(source, rel, findings);
  }

  if (findings.length > 0) {
    console.error(`[lint] ${findings.length} problem(s) — design-system slop:\n`);
    for (const f of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
      console.error(`    ${f.message}\n`);
    }
    process.exit(1);
  }
  console.log(
    `[lint] no slop found — ${linted.length} app-level component(s) clean: ${linted.join(", ")}`
  );
}

main().catch((err) => {
  console.error("[lint] failed:", err);
  process.exit(1);
});
