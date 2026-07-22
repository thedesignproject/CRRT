interface RepoConfig {
  repoUrl: string | null
  localPath: string | null
  defaultBranch: string | null
  installCommand: string | null
  devCommand: string | null
  testCommand: string | null
  buildCommand: string | null
  agentInstructions: string | null
}

interface PromptInput {
  appUrl: string
  slug: string
  token: string
  pageUrl: string | null
  projectKey: string
  projectName: string
  repoConfig: RepoConfig | null
}

function buildBody(input: PromptInput) {
  const base = input.appUrl.replace(/\/$/, '')
  const bridge = `${base}/api/v1/agent/shares/${input.slug}`
  const docUrl = `${base}/?fw_share=${encodeURIComponent(input.slug)}&token=${encodeURIComponent(input.token)}`
  const skillUrl = `${base}/skill.md`
  const docsUrl = `${base}/agent-docs`
  const bugUrl = `${base}/api/bridge/report_bug`

  const repoLines: string[] = []
  if (input.repoConfig?.repoUrl || input.repoConfig?.localPath || input.repoConfig?.installCommand) {
    repoLines.push('Project + repo:')
    repoLines.push(`- Project: ${input.projectName} (${input.projectKey})`)
    if (input.repoConfig?.localPath) repoLines.push(`- Local path: ${input.repoConfig.localPath}`)
    if (input.repoConfig?.repoUrl) repoLines.push(`- Repo URL: ${input.repoConfig.repoUrl}`)
    if (input.repoConfig?.defaultBranch) repoLines.push(`- Default branch: ${input.repoConfig.defaultBranch}`)
    if (input.repoConfig?.installCommand) repoLines.push(`- Install: ${input.repoConfig.installCommand}`)
    if (input.repoConfig?.devCommand) repoLines.push(`- Dev: ${input.repoConfig.devCommand}`)
    if (input.repoConfig?.testCommand) repoLines.push(`- Test: ${input.repoConfig.testCommand}`)
    if (input.repoConfig?.buildCommand) repoLines.push(`- Build: ${input.repoConfig.buildCommand}`)
    if (input.pageUrl) repoLines.push(`- Scoped page: ${input.pageUrl}`)
  } else {
    repoLines.push(`Project: ${input.projectName} (${input.projectKey})`)
    if (input.pageUrl) repoLines.push(`Scoped page: ${input.pageUrl}`)
  }

  // Team-authored, rendered verbatim (markdown intact) as its own labeled
  // section so agents weight it as project policy, not repo metadata.
  const instructionLines = input.repoConfig?.agentInstructions
    ? ['', '## Project instructions (from the team)', '', input.repoConfig.agentInstructions]
    : []

  return [
    'CRRT 🥕 is a visual feedback system: humans drop comments pinned to real pixels on live pages, and you implement the accepted ones.',
    '',
    'Join this session immediately so the human can see your presence:',
    docUrl,
    '',
    '1. Announce your presence. Read token from the URL above.',
    `   POST ${bridge}/presence`,
    '   Authorization: Bearer <token>   (or X-Share-Token: <token>, or ?token=<token>)',
    '   X-Agent-Id: <stable-agent-id>',
    '   Body: {"status":"reading","summary":"Connecting"}',
    '',
    '2. Read state.',
    `   GET ${bridge}/state`,
    '',
    '3. Flip presence to idle so the reviewer sees you finished connecting, then reply: Connected to CRRT and ready.',
    `   POST ${bridge}/presence`,
    '   Body: {"status":"idle","summary":"Connected — ready to start"}',
    '',
    '4. For deeper interaction, fetch:',
    `   Skill: ${skillUrl}`,
    `   Docs:  ${docsUrl}`,
    '   Read the Skill before UI changes; it is the CRRT design and workflow contract for agents.',
    '',
    '5. If the API fails in a surprising way:',
    `   POST ${bugUrl}`,
    '   Include a short summary, raw request/response, and any request IDs.',
    '',
    'Working rules:',
    '- Only work on comments whose reviewStatus is "accepted".',
    '- Claim a comment before editing: POST /ops with op:"comment.claim" and Idempotency-Key.',
    '- Report comment.start / comment.complete / comment.block as you work.',
    '- Keep presence fresh — POST /presence whenever your status changes (idle → working → blocked → idle). The reviewer UI shows your last message verbatim, so stale summaries look like you\'re stuck.',
    '- Never change reviewStatus — humans own it; you own implementationStatus only.',
    '- Comments with targetType "text_range" anchor to selected text: anchor.selectedText is the exact quote being discussed, with anchor.prefix/suffix context and anchor.containerSelector locating it. Treat the quote, not the pin coordinates, as the target.',
    '- Refresh /state before starting the next item.',
    '',
    repoLines.join('\n'),
    ...instructionLines,
  ].join('\n')
}

export function buildPrompt(target: string, input: PromptInput) {
  const body = buildBody(input)

  if (target === 'claude-code') {
    return `You are Claude Code working on a CRRT session.\n\n${body}`
  }

  if (target === 'codex') {
    return `You are Codex working on a CRRT session.\n\n${body}`
  }

  return `You are a coding agent working on a CRRT session.\n\n${body}`
}
