import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { resourceMinutes } from '../apps/landing/resources/model.ts'

const contentFiles = ['apps/landing/resources/content.ts', 'apps/landing/resources/additionalContent.ts']
const resourceRoot = 'apps/landing/resources/'

// Read data without executing code from either revision. New syntax or imports
// deliberately force a full audit until the selector understands them.
function literal(node, extra) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(item => {
    if (ts.isSpreadElement(item)) {
      if (item.expression.getText() !== 'additionalResources' || !extra) throw new Error('Unknown resource spread')
      return extra
    }
    return [literal(item)]
  })
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) throw new Error('Unknown resource property')
    return [property.name.text, literal(property.initializer)]
  }))
  throw new Error('Unknown resource expression')
}

function readArray(source, name, extra) {
  const tree = ts.createSourceFile('content.ts', source, ts.ScriptTarget.Latest, true)
  if (tree.parseDiagnostics.length) throw new Error('Invalid resource source')
  let value
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement)) {
      const target = statement.moduleSpecifier.text
      if (!['./model.ts', './additionalContent.ts'].includes(target)) throw new Error('Unknown resource import')
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier?.text !== './model.ts' || statement.exportClause) throw new Error('Unknown resource export')
    } else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
      const declaration = statement.declarationList.declarations[0]
      if (declaration.name.getText() !== name || !declaration.initializer) throw new Error('Unknown resource declaration')
      value = literal(declaration.initializer, extra)
    } else throw new Error('Unknown resource statement')
  }
  if (!Array.isArray(value)) throw new Error('Missing resource array')
  return value
}

export function readResources(read) {
  const extra = readArray(read(contentFiles[1]), 'additionalResources')
  const resources = readArray(read(contentFiles[0]), 'resources', extra)
  const slugs = resources.map(resource => resource.slug)
  if (slugs.some(slug => typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) || new Set(slugs).size !== slugs.length) throw new Error('Invalid resource slugs')
  return resources
}

function catalog(resources) {
  return resources.map(({ answer, sections, questions, sources, related, seoTitle, ...metadata }) => ({
    ...metadata, minutes: resourceMinutes({ ...metadata, answer, sections, questions, sources, related, seoTitle }),
  }))
}

/** Unknown production inputs audit everything; only known unrelated inputs skip. */
export function selectAffected({ files, current, previous }) {
  const all = ['/resources', ...current.map(resource => `/resources/${resource.slug}`)]
  const selected = new Set()
  const reasons = []
  const full = reason => ({ paths: all, reasons: [reason] })
  for (const file of files) {
    if (/(^|\/)(__tests__|tests)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /\.(md|mdx)$/.test(file)) continue
    if (contentFiles.includes(file)) {
      if (!previous) return full('Base resource content unavailable')
      // Catalog bytes are shared by every resource page. A changed title,
      // ordering, reading time, etc. therefore affects all pages, not just links.
      if (JSON.stringify(catalog(previous)) !== JSON.stringify(catalog(current))) return full('Shared resource catalog changed')
      const old = new Map(previous.map(resource => [resource.slug, resource]))
      for (const resource of current) {
        if (JSON.stringify(resource) !== JSON.stringify(old.get(resource.slug))) selected.add(`/resources/${resource.slug}`)
      }
      reasons.push('Resource article content changed')
    } else if (['ResourceTool.tsx', 'toolCalculations.ts'].some(name => file === resourceRoot + name)) {
      for (const resource of current.filter(resource => resource.tool)) selected.add(`/resources/${resource.slug}`)
      reasons.push('Shared calculator code changed')
    } else if (['ResourcesIndex.tsx', 'ResourceFigure.tsx', 'ResourceArtwork.tsx'].some(name => file === resourceRoot + name)) {
      selected.add('/resources')
      reasons.push('Resource library code changed')
    } else if (file === resourceRoot + 'ResourceArticle.tsx' || file === resourceRoot + 'readResourceData.ts') {
      for (const path of all.slice(1)) selected.add(path)
      reasons.push('Shared article code changed')
    } else if (file.startsWith('apps/landing/') || file.startsWith('src/') || file.startsWith('branding/') || file.startsWith('shared/') || file.startsWith('scripts/') || file === '.github/workflows/resources-quality.yml' || !file.includes('/')) {
      return full(`Shared or unclassified production input: ${file}`)
    } else if (!['api/', 'db/', 'docs/', 'rules/', 'apps/dashboard/', 'apps/extension/', 'packages/', '.github/', '.agents/', '.claude/', 'server/', 'workflows/', 'supabase/', 'pr/'].some(prefix => file.startsWith(prefix))) {
      return full(`Unclassified input: ${file}`)
    }
  }
  return { paths: all.filter(path => selected.has(path)), reasons: [...new Set(reasons)] }
}

export function detectAffected({ base, head = 'HEAD', force = false, git, read }) {
  // Failure to read current URLs cannot safely produce an empty selection.
  // Let the workflow fall back to the audit script's full current-page list.
  const current = readResources(read)
  const all = reason => ({ paths: ['/resources', ...current.map(resource => `/resources/${resource.slug}`)], reasons: [reason] })
  if (force) return all('Manual full audit')
  if (!base || /^0+$/.test(base)) return all('No comparison base available')
  try {
    const files = git(['diff', '--name-only', '--no-renames', '-z', base, head]).split('\0').filter(Boolean)
    const previous = files.some(file => contentFiles.includes(file))
      ? readResources(file => git(['show', `${base}:${file}`])) : undefined
    return selectAffected({ files, current, previous })
  } catch (error) {
    return all(`Full audit fallback: ${error.message}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = detectAffected({
    base: process.env.LIGHTHOUSE_BASE,
    head: process.env.LIGHTHOUSE_HEAD || 'HEAD',
    force: process.env.LIGHTHOUSE_FULL === 'true',
    git: args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }),
    read: file => readFileSync(file, 'utf8'),
  })
  console.log(JSON.stringify(result, null, 2))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `paths=${result.paths.join(',')}\nrun=${result.paths.length > 0}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Lighthouse affected pages\n\n${result.paths.length ? result.paths.map(path => `- \`${path}\``).join('\n') : 'No resource pages affected; both Lighthouse audits skipped.'}\n\n${result.reasons.join('\n\n')}\n`)
}
