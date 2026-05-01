import { sql } from 'drizzle-orm'
import { dbClient } from './_client.ts'
import { projects, projectRepoConfigs } from './schema.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const { client, db } = dbClient(url)

await db
  .insert(projects)
  .values({
    publicKey: 'demo-project',
    slug: 'demo-project',
    name: 'Feedback Widget Demo',
    allowedOrigins: [
      'http://localhost:5173',
      'http://localhost:4173',
      'http://localhost:5174',
      'http://localhost:4174',
    ],
  })
  .onConflictDoUpdate({
    target: projects.publicKey,
    set: {
      slug: sql`excluded.slug`,
      name: sql`excluded.name`,
      allowedOrigins: sql`excluded.allowed_origins`,
      updatedAt: sql`now()`,
    },
  })

await db
  .insert(projectRepoConfigs)
  .values({
    projectKey: 'demo-project',
    repoUrl: 'https://github.com/thedesignproject/feedback-widget',
    localPath: '/workspace/feedback-widget',
    defaultBranch: 'main',
    installCommand: 'bun install',
    devCommand: 'bun run dev',
    testCommand: 'bun run test',
    buildCommand: 'bun run build',
    agentInstructions:
      'Keep the public widget lightweight. Do not reintroduce reviewer-only logic into the embed.',
  })
  .onConflictDoUpdate({
    target: projectRepoConfigs.projectKey,
    set: {
      repoUrl: sql`excluded.repo_url`,
      localPath: sql`excluded.local_path`,
      defaultBranch: sql`excluded.default_branch`,
      installCommand: sql`excluded.install_command`,
      devCommand: sql`excluded.dev_command`,
      testCommand: sql`excluded.test_command`,
      buildCommand: sql`excluded.build_command`,
      agentInstructions: sql`excluded.agent_instructions`,
      updatedAt: sql`now()`,
    },
  })

await client.end()
console.log('seed complete')
