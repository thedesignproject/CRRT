import { CommentEmailEnqueueRejectedError } from './comment-email-outbox.js'
import { getComment, listProjectMembers, notifyProjectMembersOfCommentActivity, releaseCommentActivityEmailReservation, removeGuestCommentActivityNotifications, reserveCommentActivityEmail } from './store.js'
import { canSendCommentActivityEmail, getCommentActivityCooldownSeconds, getCommentActivityDashboardUrl, hasCommentActivityEmailConfig, sendCommentActivityEmail } from './comment-activity-email.js'

export async function sendCommentActivityEmailInBackground(input: {
  commentId: string
  projectKey: string
  projectName: string
  pageUrl: string
  authorName: string | null
}) {
  try {
    if (!hasCommentActivityEmailConfig()) return

    const cooldownSeconds = getCommentActivityCooldownSeconds()
    const reservation = await reserveCommentActivityEmail(
      input.projectKey,
      cooldownSeconds,
    )
    if (!reservation.shouldSend) return

    let enqueueAttempted = false
    try {
      const members = await listProjectMembers(input.projectKey, true)
      const recipients = members.map((member) => member.email).filter((email): email is string => Boolean(email))
      if (!canSendCommentActivityEmail(recipients)) {
        if (cooldownSeconds > 0) {
          await releaseCommentActivityEmailReservation(input.projectKey, reservation.activityCount)
        }
        return
      }

      enqueueAttempted = true
      await sendCommentActivityEmail({
        recipients,
        projectName: input.projectName,
        pageUrl: input.pageUrl,
        authorName: input.authorName,
        activityCount: reservation.activityCount,
        dashboardUrl: getCommentActivityDashboardUrl(),
      }, input.commentId)
    } catch (error) {
      // Only restore activity when delivery definitely has not been queued.
      // A lost enqueue response may still leave a durable job for the worker.
      if ((!enqueueAttempted || error instanceof CommentEmailEnqueueRejectedError) && cooldownSeconds > 0) {
        await releaseCommentActivityEmailReservation(input.projectKey, reservation.activityCount)
      }
      throw error
    }
  } catch (error) {
    console.warn('Comment activity email failed', error)
  }
}

export async function notifyProjectMembersOfCommentActivityInBackground(input: {
  projectKey: string
  projectName: string
  commentId: string
  authorName: string | null
  pageUrl: string
}) {
  try {
    await notifyProjectMembersOfCommentActivity(input)
    const current = await getComment(input.commentId)
    if (current?.projectId === input.projectKey && current.visibility === 'internal') {
      await removeGuestCommentActivityNotifications(input.projectKey, input.commentId)
    }
  } catch (error) {
    console.warn('Comment activity notification failed', error)
  }
}
