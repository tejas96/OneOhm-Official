import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict } from '../../common/http/errors';
import { logAction } from '../documents/customer-action-log';
import type { JourneyTask } from '../journey/journey-store';
import { reverseCredit } from './survey-credit';
import { lastSurveyOf, surveyTaskOf, updateSurvey } from './survey-record';

/**
 * The reviewer sent the survey step back (redesign §7: "reversed if the approval is undone"): the discount
 * goes back on the instalment, the self survey waits for its check again, and the log and audit say so.
 * When the instalment already fell due the discount cannot be put back by itself: the send-back is refused
 * and finance adjusts the payment first. A task with no approved self survey is left alone.
 */
export async function surveyReturned(
  tx: DatabaseExecutor,
  task: JourneyTask,
  userId: string,
): Promise<void> {
  if ((await surveyTaskOf(tx, task.projectId))?.id !== task.id) return;
  const ask = await lastSurveyOf(tx, task.id);
  if (ask?.status !== 'closed') return;
  const done = await reverseCredit(tx, {
    actionId: ask.id,
    userId,
    reason: 'the survey was sent back',
  });
  if (done === 'locked')
    throw conflict(
      'The survey discount is already on a payment that fell due. Ask finance to adjust that payment first.',
      'credit_locked',
    );
  await tx
    .update(customerActions)
    .set({ status: 'received', closedAt: null, updatedAt: new Date() })
    .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'closed')));
  await updateSurvey(tx, ask.id, () => ({ creditId: null }));
  await logAction(
    tx,
    { projectId: task.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: 'Self survey approval undone: it waits for its check again',
      userId,
      data: { customerActionId: ask.id },
    },
  );
  await recordAudit(tx, userId, 'customer_action.self_survey_undone', 'customer_action', ask.id, {
    credit: done,
  });
}
