import postgres from 'postgres'
import { isCloud } from '../api/_lib/billing/plans.js'

// Run only after db:migrate. The database is the authoritative deployment mode.
const url=process.env.DATABASE_URL
if(!url) throw new Error('DATABASE_URL is required to configure Cloud plans')
const sql=postgres(url,{max:1})
try {
  const [settings]=await sql`select enabled from public.cloud_plan_settings where id=1`
  if(settings?.enabled && !process.env.CRRT_DEPLOYMENT_MODE) throw new Error('Cloud deployments must keep CRRT_DEPLOYMENT_MODE explicit')
  await sql`update public.cloud_plan_settings set enabled=${isCloud()} where id=1`
} finally { await sql.end() }
