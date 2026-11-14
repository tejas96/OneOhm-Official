import { randomUUID } from 'node:crypto';
import { type DatabaseExecutor, projectFacts } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { AppError } from '../../common/http/errors';
import { environmentOnce } from '../../config/environment-once';
import { logAction } from '../documents/customer-action-log';
import { genericUpdateFallback } from '../projects/task-messages';
import { surveyOnComplete } from '../self-survey/survey-approve';
import { openAction } from '../send-to-customer/send-actions';
import { deliverRouted, wasDelivered } from '../send-to-customer/send-deliver';
import { inLanguage } from '../whatsapp/assistant/language';
import { confirmCompose, packFor } from './journey-compose';
import { askedBefore, contextOfTask } from './journey-context';
import { closeStaleAsks } from './journey-stale';
import {
  alertTaskOwner,
  DISPATCH_KEY,
  HANDOVER_KEY,
  INSTALLATION_KEY,
  type JourneyTask,
  OWN_NEWS_KEYS,
} from './journey-store';
import { stepOnComplete } from './step-auto';

/** True when the question went out (or is queued as its template), so the generic update is spare. */
async function ask(
  tx: DatabaseExecutor,
  task: JourneyTask,
  kind: 'site_ready' | 'installation',
): Promise<boolean> {
  // PRD rule (§21a): only a step whose template lets the customer hear about it messages by itself.
  if (!task.notifyCustomer || (await askedBefore(tx, `${kind}:${task.id}`))) return false;
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return false;
  const id = randomUUID();
  const { built, record } = await inLanguage(ctx.language, () =>
    confirmCompose(tx, ctx, task, id, kind),
  );
  if (record.kind !== 'action') return false;
  await openAction(tx, ctx, null, record);
  // Installation's question replaces the generic update: if the chat send fails, that update goes instead.
  const fallback = kind === 'installation' ? await genericUpdateFallback(tx, task) : null;
  const sent = await deliverRouted(
    tx,
    ctx,
    built,
    `journey:${kind}:${task.id}`,
    null,
    fallback ?? undefined,
  );
  return wasDelivered(tx, built, sent);
}

/** The handover pack goes by itself when the handover step is done, once, if the step lets us message. */
async function pack(tx: DatabaseExecutor, task: JourneyTask): Promise<boolean> {
  if (!task.notifyCustomer) return false;
  const [sent] = await tx
    .select({ key: projectFacts.key })
    .from(projectFacts)
    .where(
      and(eq(projectFacts.projectId, task.projectId), eq(projectFacts.key, 'handover_pack_sent')),
    );
  if (sent) return false;
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return false;
  const about = { projectId: task.projectId, leadId: null };
  let composed: Awaited<ReturnType<typeof packFor>>;
  try {
    composed = await inLanguage(ctx.language, () =>
      packFor(tx, environmentOnce(), ctx, task.projectId),
    );
  } catch (error) {
    // "No papers yet" is expected; anything else is a failure the step's owner must hear about.
    const none = error instanceof AppError && error.code === 'nothing_to_send';
    await logAction(tx, about, {
      kind: 'customer_action',
      message: none
        ? 'Handover pack not sent: there are no handover papers the customer can see.'
        : `Handover pack could not be made: ${error instanceof Error ? error.message : 'unknown error'}`,
      userId: null,
      data: {},
    });
    if (!none)
      await alertTaskOwner(tx, task, {
        kind: 'handover_pack_failed',
        title: 'The handover pack could not be sent',
        body: 'Please send it by hand from Send to customer.',
        key: `handover_pack_failed:${task.projectId}`,
      });
    return false;
  }
  if (composed.record.kind !== 'log') return false;
  const { record } = composed;
  const routed = await deliverRouted(
    tx,
    ctx,
    composed.built,
    `journey:pack:${task.projectId}`,
    null,
    (await genericUpdateFallback(tx, task)) ?? undefined,
  );
  const delivered = await wasDelivered(tx, composed.built, routed);
  await composed.after?.(tx, delivered);
  await logAction(tx, about, {
    kind: 'customer_action',
    message: delivered ? record.log : `${record.log} (not sent: the message is switched off)`,
    userId: null,
    data: record.data,
  });
  await recordAudit(tx, null, record.audit, record.entity, record.entityId, record.data);
  return delivered;
}

/** A step just became ready: the dispatch step asks "Is the roof ready?". */
export async function journeyOnReady(tx: DatabaseExecutor, task: JourneyTask): Promise<void> {
  if (task.templateKey === DISPATCH_KEY) await ask(tx, task, 'site_ready');
}

/**
 * A step was just completed: installation asks "Is it finished?", handover sends the pack, the subsidy
 * release asks "Did it reach your bank?". True when such a message went out: it already tells the
 * customer about the step, so the generic step update is skipped.
 */
export async function journeyOnComplete(
  tx: DatabaseExecutor,
  task: JourneyTask,
  userId: string | null = null,
): Promise<boolean> {
  await closeStaleAsks(tx, task);
  await surveyOnComplete(tx, task, userId);
  let told = false;
  if (task.templateKey === INSTALLATION_KEY) told = await ask(tx, task, 'installation');
  if (task.templateKey === HANDOVER_KEY) told = await pack(tx, task);
  const credit = await stepOnComplete(tx, task);
  return OWN_NEWS_KEYS.has(task.templateKey) && (told || credit);
}
