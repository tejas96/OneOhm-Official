import type { SendRequest } from '@oneohm/api-contracts';
import { type DatabaseExecutor, homeNameOf, projectFacts } from '@oneohm/database';
import { conflict, invalid, notFound } from '../../common/http/errors';
import type { Environment } from '../../config/environment';
import type { SendContext } from '../send-to-customer/send-context';
import { type Deps, resolvePaper } from '../send-to-customer/send-papers';
import type { Composed } from '../send-to-customer/send-recorded';
import { sharedFileUrl } from '../whatsapp/file-links';
import { handoverPack, installationAsk, readinessAsk, signatureAsk } from './journey-messages';
import { handoverPapers } from './journey-papers';
import { DISPATCH_KEY, INSTALLATION_KEY, type JourneyTask, taskFor } from './journey-store';

type Of<A extends SendRequest['action']> = Extract<SendRequest, { action: A }>;

const NOT_ALLOWED = 'This step is not set to message customers (Settings → Task templates).';

/** A task of this project whose template lets the customer hear about it (PRD 6.2), of the kind asked. */
async function allowedTask(
  deps: Deps,
  ctx: SendContext,
  taskId: string,
  key: string | null,
): Promise<JourneyTask> {
  const task = await taskFor(deps.db, taskId);
  if (!task || task.projectId !== ctx.projectId) throw notFound('That task');
  if (key && task.templateKey !== key)
    throw invalid('This question belongs to another step of the project.');
  if (task.status === 'completed' && key === DISPATCH_KEY)
    throw conflict('Dispatch is done already.', 'done');
  if (!task.notifyCustomer) throw invalid(NOT_ALLOWED);
  return task;
}

/** A paper (or report) to read and agree to; a task given must be one the customer may hear about. */
export async function signatureCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'send_signature'>,
  id: string,
): Promise<Composed> {
  if (!ctx.projectId) throw invalid('Choose a project to send a paper for signature.');
  const task = request.taskId ? await allowedTask(deps, ctx, request.taskId, null) : null;
  const paper = await resolvePaper(deps, ctx, request.paperId);
  const home = await homeNameOf(deps.db, ctx.projectId);
  return {
    built: signatureAsk(
      { customer: ctx.customerName, paper, home, link: sharedFileUrl(deps.env, paper.file) },
      id,
    ),
    record: {
      kind: 'action',
      id,
      type: 'signature',
      taskId: task?.id ?? null,
      title: `Sign: ${paper.title}`,
      propertyId: null,
      projectId: ctx.projectId,
      payload: {
        target: paper.id,
        paperId: paper.id,
        paperTitle: paper.title,
        ...(task ? { taskId: task.id } : {}),
      },
      log: `Sent ${paper.title} to the customer for signature (WhatsApp)`,
    },
  };
}

/** "Is the roof ready?" for the project's dispatch task. */
export async function siteReadyCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_site_ready'>,
  id: string,
): Promise<Composed> {
  const task = await allowedTask(deps, ctx, request.taskId, DISPATCH_KEY);
  return confirmCompose(deps.db, ctx, task, id, 'site_ready');
}

/** "Is the installation finished?" for the project's installation task. */
export async function installCheckCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_installation_check'>,
  id: string,
): Promise<Composed> {
  const task = await allowedTask(deps, ctx, request.taskId, INSTALLATION_KEY);
  return confirmCompose(deps.db, ctx, task, id, 'installation');
}

export async function confirmCompose(
  db: DatabaseExecutor,
  ctx: SendContext,
  task: JourneyTask,
  id: string,
  kind: 'site_ready' | 'installation',
): Promise<Composed> {
  const home = await homeNameOf(db, task.projectId);
  const ready = kind === 'site_ready';
  return {
    built: (ready ? readinessAsk : installationAsk)(ctx.customerName, home, id),
    record: {
      kind: 'action',
      id,
      type: 'confirm',
      taskId: task.id,
      title: ready ? `Roof ready at ${home}?` : `Installation finished at ${home}?`,
      propertyId: null,
      projectId: task.projectId,
      payload: { target: `${kind}:${task.id}`, kind, taskId: task.id },
      log: ready
        ? 'Asked the customer whether the roof is ready for installation (WhatsApp)'
        : 'Asked the customer whether the installation is finished to their satisfaction (WhatsApp)',
    },
  };
}

/** Every handover paper, as documents, with the summary line; the checklist fact is set once it is sent. */
export async function packCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'send_handover_pack'>,
): Promise<Composed> {
  if (ctx.projectId !== request.projectId) throw notFound('That project');
  return packFor(deps.db, deps.env, ctx, request.projectId);
}

/** The pack for a project: the staff send, and the one that goes by itself when the handover task is done. */
export async function packFor(
  db: DatabaseExecutor,
  env: Environment,
  ctx: SendContext,
  projectId: string,
): Promise<Composed> {
  const papers = await handoverPapers(db, env, {
    customerId: ctx.customerId,
    customerName: ctx.customerName,
    projectId,
  });
  if (papers.length === 0)
    throw conflict('There are no handover papers the customer can see yet.', 'nothing_to_send');
  const home = await homeNameOf(db, projectId);
  return {
    built: handoverPack({ customer: ctx.customerName, home, projectId }, papers),
    record: {
      kind: 'log',
      audit: 'customer.handover_pack_sent',
      entity: 'project',
      entityId: projectId,
      log: `Sent the handover pack (${papers.length} papers) to the customer on WhatsApp`,
      projectId,
      data: { papers: papers.map((one) => one.paper.caption) },
    },
    after: (tx) => markPackSent(tx, projectId),
  };
}

/** The checklist row "Handover pack sent": a project fact with the day, kept once. */
export async function markPackSent(tx: DatabaseExecutor, projectId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await tx
    .insert(projectFacts)
    .values({ projectId, key: 'handover_pack_sent', value: day })
    .onConflictDoUpdate({
      target: [projectFacts.projectId, projectFacts.key],
      set: { value: day, updatedAt: new Date() },
    });
}
