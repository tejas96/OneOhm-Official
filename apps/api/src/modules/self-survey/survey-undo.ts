import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict } from '../../common/http/errors';
import { logAction } from '../documents/customer-action-log';
import type { JourneyTask } from '../journey/journey-store';
import { inLanguage } from '../whatsapp/assistant/language';
import { languageOfCustomer, tellPlain } from './survey-approve';
import { reverseCredit } from './survey-credit';
import { lastSurveyOf, surveyTaskOf, updateSurvey } from './survey-record';
import { SURVEY_WORDS } from './survey-words';

/**
 * An approved survey is undone (nothing in the product does this yet; it is ready for the day a finished survey
 * step can be reopened): the discount goes back on its instalment, the survey waits for its check again, the log and
 * audit say so and the customer is told. When the instalment already fell due the discount cannot be put back by
 * itself: the undo is refused (409) and finance adjusts that payment first.
 */
export async function undoApproval(
  tx: DatabaseExecutor,
  task: JourneyTask,
  userId: string,
): Promise<void> {
  if ((await surveyTaskOf(tx, task.projectId))?.id !== task.id) return;
  const ask = await lastSurveyOf(tx, task.id);
  if (ask?.status !== 'closed') return;
  const done = await reverseCredit(tx, {
    projectId: task.projectId,
    userId,
    reason: 'the survey approval was undone',
  });
  if (done.kind === 'locked')
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
    credit: done.kind,
  });
  if (done.kind === 'reversed')
    await inLanguage(await languageOfCustomer(tx, ask.customerId), () =>
      tellPlain(
        tx,
        ask.customerId,
        `self_survey_undone:${ask.id}:${Date.now()}`,
        SURVEY_WORDS.reversed(formatInr(done.paise)),
      ),
    );
}
