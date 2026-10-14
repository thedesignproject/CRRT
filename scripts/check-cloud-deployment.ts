import postgres from 'postgres'
import {validateCloudDeployment} from '../api/_lib/billing/deployment-mode.js'
import {billingConfig,stripeEnabled} from '../api/_lib/billing/config.js'

const url=process.env.DATABASE_URL
if(!url)throw new Error('DATABASE_URL is required for deployment validation')
const sql=postgres(url,{max:1})
try{
  // Runs before migration too: a brand-new database has no settings table yet.
  const [table]=await sql`select to_regclass('public.cloud_plan_settings') as name`
  let enabled=false
  if(table.name){
    const [settings]=await sql`select enabled from public.cloud_plan_settings where id=1`
    if(!settings)throw new Error('Cloud plan settings are missing')
    enabled=settings.enabled
  }
  validateCloudDeployment(enabled)
  if(stripeEnabled())billingConfig()
}finally{await sql.end()}
