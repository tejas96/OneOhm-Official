import { customerActions, type DatabaseExecutor, homeNameOf, properties } from '@oneohm/database';
import { consumerNumberProblem, normalizeConsumerNumber } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { AppError } from '../../common/http/errors';
import { assertConsumerNumberFree } from '../crm/site-rules';
import { logAction } from '../documents/customer-action-log';
import { contextOfTask } from '../journey/journey-context';
import type { JourneyTask } from '../journey/journey-store';
import { deliver } from '../send-to-customer/send-deliver';
import { inLanguage } from '../whatsapp/assistant/language';
import { applyCredit, type CreditResult } from './survey-credit';
import {
  homeOfProject,
  lastSurveyOf,
  payloadOf,
  surveyTaskOf,
  updateSurvey,
} from './survey-record';
import { SURVEY_WORDS } from './survey-words';

/** The consumer number the customer typed goes on the home when it has none and the number is free. */
async function keepConsumerNumber(
  tx: DatabaseExecutor,
  projectId: string,
  typed: string | undefined,
) {
  const home = await homeOfProject(tx, projectId);
  if (!typed || !home || home.consumerNumber) return null;
  const number = normalizeConsumerNumber(typed);
  if (consumerNumberProblem(number)) return 'it does not look like a consumer number';
  try {
    await assertConsumerNumberFree(tx, number, {
      exceptPropertyId: home.propertyId,
      field: 'consumer_number',
      reveal: false,
    });
  } catch (error) {
    if (error instanceof AppError) return 'another site already has it';
    throw error;
  }
  await tx
    .update(properties)
    .set({ consumerNumber: number })
    .where(eq(properties.id, home.propertyId));
  return null;
}

/** What the customer is told once the survey is approved, in their language. */
function toldWords(credit: CreditResult, paise: number): string {
  if (credit.kind === 'none' && paise > 0) return SURVEY_WORDS.approvedPending;
  if (paise <= 0) return SURVEY_WORDS.approvedPlain;
  return SURVEY_WORDS.approved(formatInr(paise));
}

/**
 * The survey step was completed (the engineer approved the survey, the same completion as a field
 * survey, redesign §7): the self survey waiting for its check is closed, the typed consumer number goes on
 * the home, the offered credit is taken off the next instalment (once: `applyCredit` finds an earlier one),
 * the customer is told, and the project log and audit say so. Nothing happens for a task with no sent survey.
 */
export async function surveyOnComplete(
  tx: DatabaseExecutor,
  task: JourneyTask,
  userId: string | null,
) {
  const survey = await surveyTaskOf(tx, task.projectId);
  if (survey?.id !== task.id) return;
  const ask = await lastSurveyOf(tx, task.id);
  if (ask?.status !== 'received') return;
  const now = new Date();
  const [closed] = await tx
    .update(customerActions)
    .set({ status: 'closed', closedAt: now, updatedAt: now })
    .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'received')))
    .returning();
  if (!closed) return;
  const payload = payloadOf(closed);
  const credit = await applyCredit(tx, {
    projectId: task.projectId,
    actionId: ask.id,
    amountPaise: payload.offerPaise,
    userId,
  });
  const problem = await keepConsumerNumber(tx, task.projectId, payload.answers.consumer);
  if (credit.kind === 'applied') await updateSurvey(tx, ask.id, () => ({ creditId: credit.id }));
  const home = await homeNameOf(tx, task.projectId);
  const line = `Self survey approved${credit.kind === 'applied' ? `: ${formatInr(payload.offerPaise)} taken off ${credit.label}` : credit.kind === 'none' && payload.offerPaise > 0 ? ': no upcoming payment could take the discount, please give it by hand' : ''}${problem ? `. The consumer number was not saved (${problem})` : ''}`;
  await logAction(
    tx,
    { projectId: task.projectId, leadId: null },
    { kind: 'customer_action', message: line, userId, data: { customerActionId: ask.id } },
  );
  await recordAudit(tx, userId, 'customer_action.self_survey_approved', 'customer_action', ask.id, {
    credit: credit.kind,
    amountPaise: payload.offerPaise,
  });
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return;
  await inLanguage(ctx.language, async () => {
    const words = toldWords(credit, payload.offerPaise);
    await deliver(
      tx,
      ctx,
      {
        replies: [{ kind: 'text', body: words }],
        template: {
          key: 'self_survey_approved',
          payload: {
            customer: titleCaseName(ctx.customerName.split(/\s+/)[0] ?? ''),
            home,
            amount: words,
          },
        },
      },
      `self_survey_approved:${ask.id}`,
      null,
    );
  });
}
