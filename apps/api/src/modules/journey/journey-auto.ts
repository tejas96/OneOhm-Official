import { randomUUID } from 'node:crypto';
import { customerActions, type DatabaseExecutor, projectFacts, projects } from '@oneohm/database';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { AppError } from '../../common/http/errors';
import { environmentOnce } from '../../config/environment-once';
import { logAction } from '../documents/customer-action-log';
import { openAction } from '../send-to-customer/send-actions';
import { contextFor, type SendContext } from '../send-to-customer/send-context';
import { deliver, templateOn } from '../send-to-customer/send-deliver';
import { inLanguage } from '../whatsapp/assistant/language';
import { confirmCompose, packFor } from './journey-compose';
import { closeStaleAsks } from './journey-confirm';
import {
  alertTaskOwner,
  DISPATCH_KEY,
  HANDOVER_KEY,
  INSTALLATION_KEY,
  type JourneyTask,
} from './journey-store';

/** The customer's context for a project task, as the system acting on its own (no staff member). */
async function contextOfTask(db: DatabaseExecutor, task: JourneyTask): Promise<SendContext | null> {
  const [project] = await db
    .select({ customerId: projects.customerId, code: projects.code })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  if (!project) return null;
  return contextFor(db, {
    customerId: project.customerId,
    projectId: task.projectId,
    projectCode: project.code,
    leadId: null,
    taskId: task.id,
    serviceRequestId: null,
  });
}

/** Whether this question was asked before (answered or not): each is asked once per step. */
async function askedBefore(db: DatabaseExecutor, target: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.type, 'confirm'),
        sql`${customerActions.payload}->>'target' = ${target}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function ask(tx: DatabaseExecutor, task: JourneyTask, kind: 'site_ready' | 'installation') {
  // PRD rule (§21a): only a step whose template lets the customer hear about it messages by itself.
  if (!task.notifyCustomer || (await askedBefore(tx, `${kind}:${task.id}`))) return;
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return;
  const id = randomUUID();
  const { built, record } = await inLanguage(ctx.language, () =>
    confirmCompose(tx, ctx, task, id, kind),
  );
  if (record.kind !== 'action') return;
  await openAction(tx, ctx, null, record);
  await deliver(tx, ctx, built, `journey:${kind}:${task.id}`, null);
}

/** The handover pack goes by itself when the handover step is done, once, if the step lets us message. */
async function pack(tx: DatabaseExecutor, task: JourneyTask) {
  if (!task.notifyCustomer) return;
  const [sent] = await tx
    .select({ key: projectFacts.key })
    .from(projectFacts)
    .where(
      and(eq(projectFacts.projectId, task.projectId), eq(projectFacts.key, 'handover_pack_sent')),
    );
  if (sent) return;
  const ctx = await contextOfTask(tx, task);
  if (!ctx) return;
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
    return;
  }
  if (composed.record.kind !== 'log') return;
  const { record } = composed;
  const via = await deliver(tx, ctx, composed.built, `journey:pack:${task.projectId}`, null);
  const delivered = via === 'chat' || (await templateOn(tx, composed.built.template.key));
  await composed.after?.(tx, delivered);
  await logAction(tx, about, {
    kind: 'customer_action',
    message: delivered ? record.log : `${record.log} (not sent: the message is switched off)`,
    userId: null,
    data: record.data,
  });
  await recordAudit(tx, null, record.audit, record.entity, record.entityId, record.data);
}

/** A step just became ready: the dispatch step asks "Is the roof ready?". */
export async function journeyOnReady(tx: DatabaseExecutor, task: JourneyTask): Promise<void> {
  if (task.templateKey === DISPATCH_KEY) await ask(tx, task, 'site_ready');
}

/** A step was just completed: installation asks "Is it finished?", handover sends the pack. */
export async function journeyOnComplete(tx: DatabaseExecutor, task: JourneyTask): Promise<void> {
  await closeStaleAsks(tx, task);
  if (task.templateKey === INSTALLATION_KEY) await ask(tx, task, 'installation');
  if (task.templateKey === HANDOVER_KEY) await pack(tx, task);
}
