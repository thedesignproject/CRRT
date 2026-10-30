// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { feedbackVersionGuardSql } from './schema'
it('ships the version fence from the schema source without changing the RPC signature', () => {
 expect(readFileSync('db/migrations/0047_feedback_version_guard.sql','utf8').trim()).toBe(feedbackVersionGuardSql.trim())
 expect(feedbackVersionGuardSql.indexOf('FOR UPDATE')).toBeLessThan(feedbackVersionGuardSql.indexOf("expected_updated_at"))
 expect(feedbackVersionGuardSql.indexOf('status_conflict')).toBeLessThan(feedbackVersionGuardSql.indexOf('update_comment_review_status'))
})
