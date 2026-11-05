import {
  customerActions,
  customers,
  type DatabaseExecutor,
  homeNameOf,
  noticeCustomer,
  properties,
} from '@oneohm/database';
import { consumerNumberProblem, normalizeConsumerNumber } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { AppError } from '../../common/http/errors';
import { assertConsumerNumberFree } from '../crm/site-rules';
import { logAction } from '../documents/customer-action-log';
import { languageOfPhone } from '../documents/document-request-messages';
import { contextOfTask } from '../journey/journey-context';
import type { JourneyTask } from '../journey/journey-store';
import { chatOpenFor } from '../send-to-customer/send-context';
import { deliver } from '../send-to-customer/send-deliver';
import { inLanguage } from '../whatsapp/assistant/language';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';
import { applyCredit } from './survey-credit';
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

/** The language of a customer's chat. */
export async function languageOfCustomer(tx: DatabaseExecutor, customerId: string) {
  const [person] = await tx
    .select({ phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, customerId));
  return languageOfPhone(tx, person?.phone ?? '');
}

/** What follows "Survey approved" for the customer: the discount and the payment it comes off, or only thanks. */
export function clauseOf(
  credit: Awaited<ReturnType<typeof applyCredit>>,
  paise: number,
  payment: string | null,
): string {
  const amount = formatInr(paise);
  if (credit?.kind === 'applied')
    return SURVEY_WORDS.clauseApplied(amount, payment ?? credit.label);
  if (credit?.kind === 'pending') return SURVEY_WORDS.clausePending(amount);
  return SURVEY_WORDS.clausePlain;
}

/** Tells the customer one thing: the app inbox always, the chat while its window is open and they did not say STOP. */
async function tellPlain(tx: DatabaseExecutor, customerId: string, key: string, body: string) {
  const [person] = await tx
    .select({ phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!person) return;
  await noticeCustomer(tx, person.phone, 'action_cancelled', { what: body, note: body }, key);
  if (await chatOpenFor(tx, person.phone))
    await queueReply(
      tx,
      await conversationForPhone(tx, person.phone),
      { kind: 'text', body },
      null,
      key,
    );
}

/**
 * The survey step was completed (the engineer approved the survey: the same completion as a field survey, redesign §7).
 * A survey the customer is still asked to send (an ask-again left open) is cancelled and they are told there is no
 * need. A survey waiting for its check is closed, the typed consumer number goes on the home, the project earns its
 * discount once (`applyCredit`: one per project, so a second survey never earns a second), the customer is told,
 * and the log and audit say so. Nothing happens for a task with no sent survey.
 */
export async function surveyOnComplete(
  tx: DatabaseExecutor,
  task: JourneyTask,
  userId: string | null,
) {
  const survey = await surveyTaskOf(tx, task.projectId);
  if (survey?.id !== task.id) return;
  const ask = await lastSurveyOf(tx, task.id);
  if (ask?.status === 'open') {
    const [cancelled] = await tx
      .update(customerActions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'open')))
      .returning();
    if (!cancelled) return;
    await logAction(
      tx,
      { projectId: task.projectId, leadId: null },
      {
        kind: 'customer_action',
        message: 'Self survey cancelled: the engineer finished the survey step',
        userId,
        data: { customerActionId: ask.id },
      },
    );
    await inLanguage(await languageOfCustomer(tx, ask.customerId), () =>
      tellPlain(tx, ask.customerId, `self_survey_no_need:${ask.id}`, SURVEY_WORDS.noNeed),
    );
    return;
  }
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
  if (credit?.kind === 'applied') await updateSurvey(tx, ask.id, () => ({ creditId: credit.id }));
  const home = await homeNameOf(tx, task.projectId);
  const said = {
    applied: `: ${formatInr(payload.offerPaise)} taken off ${credit?.kind === 'applied' ? credit.label : ''}`,
    pending: `: ${formatInr(payload.offerPaise)} discount is pending, finance was told`,
    already: ': the project already had its survey discount, no second one',
    none: '',
  }[credit?.kind ?? 'none'];
  await logAction(
    tx,
    { projectId: task.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: `Self survey approved${said}${problem ? `. The consumer number was not saved (${problem})` : ''}`,
      userId,
      data: { customerActionId: ask.id },
    },
  );
  await recordAudit(tx, userId, 'customer_action.self_survey_approved', 'customer_action', ask.id, {
    credit: credit?.kind ?? 'none',
    amountPaise: payload.offerPaise,
  });
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return;
  await inLanguage(ctx.language, async () => {
    const clause = clauseOf(credit?.kind === 'already' ? null : credit, payload.offerPaise, null);
    await deliver(
      tx,
      ctx,
      {
        replies: [{ kind: 'text', body: `${SURVEY_WORDS.approvedHead} ${clause}` }],
        template: {
          key: 'self_survey_approved',
          payload: {
            customer: titleCaseName(ctx.customerName.split(/\s+/)[0] ?? ''),
            home,
            amount: clause,
          },
        },
      },
      `self_survey_approved:${ask.id}`,
      null,
    );
  });
}

export { tellPlain };
