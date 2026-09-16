import { execFile } from 'node:child_process'
import { Sandbox } from '@vercel/sandbox'
import {
  auditEvidenceSchema,
  type AuditBudgets,
  type AuditEvidence,
  type AuditSourceCoverage,
} from '../../../shared/product-audit/contracts.js'
import { isAuditDemoHostname, type AuditTarget } from './url-safety.js'

export type ExplorationResult = { evidence: AuditEvidence[]; coverage: AuditSourceCoverage }

export interface AuditExplorer {
  explore(target: AuditTarget, budgets: AuditBudgets): Promise<ExplorationResult>
}

const demoEvidence: AuditEvidence[] = [
  { id: 'pricing-promise', source: 'url', signalKey: 'trial-promise', location: '/pricing · hero copy', observation: 'The primary plan promises “Start free — no card required.”', confidence: 0.99, direct: true },
  { id: 'signup-card-field', source: 'url', signalKey: 'signup-payment-gate', location: '/signup · step 2 of 2', observation: 'The same trial flow requires a valid card before the workspace can be created.', confidence: 0.99, direct: true },
  { id: 'signup-field-count', source: 'url', signalKey: 'signup-friction', location: '/signup · first-use path', observation: 'Nine required fields appear before the user sees the product for the first time.', confidence: 0.96, direct: true },
  { id: 'signup-value-delay', source: 'url', signalKey: 'delayed-value', location: '/signup → /onboarding · observed journey', observation: 'A user must complete account, company, team, and payment steps before reaching a usable screen.', confidence: 0.94, direct: false },
  { id: 'form-reset', source: 'url', signalKey: 'destructive-error-state', location: '/signup · invalid promo-code interaction', observation: 'Submitting an invalid promo code clears the previously entered company and team fields.', confidence: 0.97, direct: true },
]

export class FixtureAuditExplorer implements AuditExplorer {
  async explore(target: AuditTarget): Promise<ExplorationResult> {
    if (!isAuditDemoHostname(target.hostname)) throw new Error('fixture_target_not_allowed')
    return {
      evidence: demoEvidence.map((item) => auditEvidenceSchema.parse({
        ...item,
        kind: 'observable',
        route: item.location.split(' · ')[0],
        provenance: { collector: 'fixture-explorer', target: target.url },
        capture: { capturedAt: new Date().toISOString() },
      })),
      coverage: { evaluatedSources: ['url'], unavailableSources: ['customer-rule', 'design-system', 'repository'], routesAttempted: 1, routesEvaluated: 1 },
    }
  }
}

type SandboxPage = { url: string; status: number; title: string; text: string; links: string[]; formCount: number; controlCount: number; failed?: boolean }
type IsolatedCommandOutput = { exitCode: number; stdout: string; stderr: string }
type DockerExec = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void

const sandboxScript = String.raw`
(async () => {
const http = require('node:http'); const https = require('node:https');
const origin = new URL(process.env.TARGET_URL).origin;
const addresses = JSON.parse(process.env.TARGET_ADDRESSES); const maxBody = 256000;
const queue = [process.env.TARGET_URL]; const seen = new Set(); const pages = []; let actions = 0;
function requestAt(url, address) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({ protocol: url.protocol, hostname: address, port: url.port || undefined,
      path: url.pathname + url.search, method: 'GET', servername: url.hostname,
      headers: { host: url.host, 'user-agent': 'CRRT-Product-Audit/1.0', accept: 'text/html' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume(); resolve({ status: response.statusCode, location: response.headers.location, body: '' }); return;
      }
      const chunks = []; let size = 0; let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }); } };
      response.on('data', (chunk) => { const remaining = maxBody - size; if (remaining > 0) chunks.push(chunk.subarray(0, remaining)); size += Math.min(remaining, chunk.length); if (size >= maxBody) { finish(); response.destroy(); } });
      response.on('end', finish); response.on('error', reject);
    });
    request.setTimeout(15000, () => request.destroy(new Error('request_timeout'))); request.on('error', reject); request.end();
  });
}
async function load(raw, redirects = 0) {
  if (redirects > 5) throw new Error('redirect_limit');
  const url = new URL(raw); if (url.origin !== origin) throw new Error('cross_origin_redirect');
  let response; let lastError;
  for (const address of addresses) { try { response = await requestAt(url, address); break; } catch (error) { lastError = error; } }
  if (!response) throw lastError || new Error('host_unreachable');
  if (response.location) return load(new URL(response.location, url).toString(), redirects + 1);
  return { ...response, url: url.toString() };
}
while (queue.length && pages.length < Number(process.env.MAX_ROUTES)) {
  const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
  try {
    const response = await load(url); const html = response.body;
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '';
    const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].flatMap((match) => { try { const value = new URL(match[1], response.url); return value.origin === origin ? [value.toString()] : []; } catch { return []; } });
    pages.push({ url: response.url, status: response.status, title, text: html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000), links: links.slice(0, 20), formCount: (html.match(/<form\b/gi) || []).length, controlCount: (html.match(/<(button|input|select|textarea)\b/gi) || []).length });
    for (const link of links) if (!seen.has(link) && actions < Number(process.env.MAX_ACTIONS)) { queue.push(link); actions += 1; }
  } catch { pages.push({ url, status: 0, title: '', text: '', links: [], formCount: 0, controlCount: 0, failed: true }); }
}
console.log(JSON.stringify({ pages }));
})().catch((error) => { console.error(error instanceof Error ? error.message : 'explorer_failed'); process.exitCode = 1; });
`

function explorationResult(output: string, collector: string): ExplorationResult {
  const pages = (JSON.parse(output) as { pages: SandboxPage[] }).pages
  const evidence = pages.flatMap((page, index) => {
    const route = new URL(page.url).pathname
    return [auditEvidenceSchema.parse({
      id: `page-${index + 1}-response`, source: 'url', signalKey: 'route-response',
      location: new URL(page.url).pathname, route: new URL(page.url).pathname, kind: 'network',
      observation: page.failed ? 'The route could not be fetched safely.' : `The route returned HTTP ${page.status}${page.title ? ` with title “${page.title}”.` : '.'}`,
      confidence: 1, direct: false,
      provenance: { collector, target: page.url },
      capture: { status: page.status, formCount: page.formCount, controlCount: page.controlCount, textExcerpt: page.text.slice(0, 2_000) },
    }), ...(page.status >= 200 && page.status < 300 && page.text ? [auditEvidenceSchema.parse({
      id: `page-${index + 1}-content`, source: 'url', signalKey: `route-content:${route}`,
      location: route, route, kind: 'observable',
      observation: `The route visibly presents: “${page.text.slice(0, 400)}”`,
      confidence: 1, direct: true, provenance: { collector, target: page.url },
      capture: { status: page.status, formCount: page.formCount, controlCount: page.controlCount, textExcerpt: page.text.slice(0, 2_000) },
    })] : [])]
  })
  return {
    evidence,
    coverage: {
      evaluatedSources: ['url'], unavailableSources: ['customer-rule', 'design-system', 'repository'],
      routesAttempted: pages.length, routesEvaluated: pages.filter((page) => page.status >= 200 && page.status < 300).length,
      ...(pages.length && pages.every((page) => page.status >= 200 && page.status < 300) ? {} : { partialReason: 'One or more public routes could not be evaluated.' }),
    },
  }
}

export function runDockerExplorer(
  target: AuditTarget,
  budgets: AuditBudgets,
  execute: DockerExec = execFile as unknown as DockerExec,
): Promise<IsolatedCommandOutput> {
  const args = [
    'run', '--rm', '--network', 'bridge', '--memory', '256m', '--cpus', '1',
    '--pids-limit', '64', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--env', `TARGET_URL=${target.url}`, '--env', `MAX_ROUTES=${budgets.maxRoutes}`,
    '--env', `MAX_ACTIONS=${budgets.maxActions}`, '--env', `TARGET_ADDRESSES=${JSON.stringify(target.addresses)}`, 'node:24-alpine', 'node', '-e', sandboxScript,
  ]
  return new Promise((resolve) => execute(
    'docker', args, { timeout: budgets.wallClockMs, maxBuffer: 1_000_000 },
    (error, stdout, stderr) => resolve({ exitCode: error ? 1 : 0, stdout, stderr }),
  ))
}

export class DockerAuditExplorer implements AuditExplorer {
  constructor(private readonly run = runDockerExplorer) {}

  async explore(target: AuditTarget, budgets: AuditBudgets): Promise<ExplorationResult> {
    const command = await this.run(target, budgets)
    if (command.exitCode !== 0) throw new Error(command.stderr.trim() || 'docker_explorer_failed')
    return explorationResult(command.stdout, 'local-docker')
  }
}

export class SandboxAuditExplorer implements AuditExplorer {
  async explore(target: AuditTarget, budgets: AuditBudgets): Promise<ExplorationResult> {
    const sandbox = await Sandbox.create({ resources: { vcpus: 1 }, timeout: budgets.wallClockMs })
    try {
      const command = await sandbox.runCommand({
        cmd: 'node',
        args: ['-e', sandboxScript],
        env: { TARGET_URL: target.url, TARGET_ADDRESSES: JSON.stringify(target.addresses), MAX_ROUTES: String(budgets.maxRoutes), MAX_ACTIONS: String(budgets.maxActions) },
      })
      const output = await command.stdout()
      if (command.exitCode !== 0) throw new Error('sandbox_explorer_failed')
      return explorationResult(output, 'vercel-sandbox')
    } finally {
      await sandbox.stop()
    }
  }
}
