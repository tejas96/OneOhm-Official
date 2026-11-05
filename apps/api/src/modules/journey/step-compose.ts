import type { SendRequest } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  homeNameOf,
  projectLoans,
  projects,
  quotations,
} from '@oneohm/database';
import { bankDayOk, STEP_TASK_KEYS, type StepKind } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { conflict, invalid } from '../../common/http/errors';
import { daySpan } from '../../common/notices';
import type { SendContext } from '../send-to-customer/send-context';
import { type Deps, resolvePaper } from '../send-to-customer/send-papers';
import type { Composed } from '../send-to-customer/send-recorded';
import { sharedFileUrl } from '../whatsapp/file-links';
import { allowedTask } from './journey-compose';
import { type JourneyTask, taskByKey } from './journey-store';
import { bankSignAsk, creditAsk, layoutAsk, registerAsk } from './step-messages';

type Of<A extends SendRequest['action']> = Extract<SendRequest, { action: A }>;

/** The subsidy the quotation promised, in paise (0 when the project has none). */
export async function subsidyOf(db: DatabaseExecutor, projectId: string): Promise<number> {
  const [row] = await db
    .select({ paise: quotations.subsidyPaise })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.id, projectId));
  return row?.paise ?? 0;
}

/** The step-question record: one `confirm` customer action whose payload names its kind. */
function recordOf(
  kind: StepKind,
  task: JourneyTask,
  id: string,
  target: string,
  title: string,
  log: string,
  more: Record<string, unknown> = {},
): Composed['record'] {
  return {
    kind: 'action',
    id,
    type: 'confirm',
    taskId: task.id,
    title,
    propertyId: null,
    projectId: task.projectId,
    payload: { target, kind, taskId: task.id, ...more },
    log,
  };
}

/** "Please register on the PM Surya Ghar portal" for a subsidy step of the project. */
export async function registerCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_subsidy_register'>,
  id: string,
): Promise<Composed> {
  const task = await allowedTask(deps, ctx, request.taskId, STEP_TASK_KEYS.subsidy_register);
  const home = await homeNameOf(deps.db, task.projectId);
  return {
    built: registerAsk(ctx.customerName, home, id),
    record: recordOf(
      'subsidy_register',
      task,
      id,
      `subsidy_register:${task.id}`,
      'Register on PM Surya Ghar',
      'Asked the customer to register on the PM Surya Ghar portal (WhatsApp)',
    ),
  };
}

/** "Did the subsidy reach your bank account?" once the release step is marked done. */
export async function creditCompose(
  db: DatabaseExecutor,
  ctx: SendContext,
  task: JourneyTask,
  id: string,
): Promise<Composed> {
  if (task.status !== 'completed')
    throw conflict('The subsidy is not marked as released yet.', 'not_released');
  const paise = await subsidyOf(db, task.projectId);
  if (paise <= 0) throw conflict('This project has no subsidy amount to ask about.', 'no_subsidy');
  const amount = formatInr(paise);
  const home = await homeNameOf(db, task.projectId);
  return {
    built: creditAsk({ customer: ctx.customerName, amount, home }, id),
    record: recordOf(
      'subsidy_credit',
      task,
      id,
      `subsidy_credit:${task.id}`,
      `Subsidy ${amount} received?`,
      `Asked the customer whether the ${amount} subsidy reached their bank account (WhatsApp)`,
      { amountPaise: paise },
    ),
  };
}

export async function creditFromRequest(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_subsidy_credit'>,
  id: string,
): Promise<Composed> {
  const task = await allowedTask(deps, ctx, request.taskId, STEP_TASK_KEYS.subsidy_credit);
  return creditCompose(deps.db, ctx, task, id);
}

/** "Please visit {bank}, {branch} on {day} to sign the loan papers" for a project with a loan. */
export async function bankSignCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_bank_sign'>,
  id: string,
): Promise<Composed> {
  if (ctx.projectId !== request.projectId) throw invalid('Choose the project with the loan.');
  const task = await taskByKey(deps.db, request.projectId, STEP_TASK_KEYS.bank_sign);
  if (!task) throw conflict('This project has no loan.', 'no_loan');
  await allowedTask(deps, ctx, task.id, STEP_TASK_KEYS.bank_sign);
  if (!bankDayOk(request.day, todayIn(deps.env.BUSINESS_TIMEZONE)))
    throw invalid('Pick a day from today on.', { day: 'Not a day from today on.' });
  const [loan] = await deps.db
    .select({ bank: projectLoans.lenderName })
    .from(projectLoans)
    .where(eq(projectLoans.projectId, request.projectId));
  const bank = loan?.bank.trim();
  if (!bank) throw conflict('Add the lender in Finance → Loans first.', 'no_lender');
  const day = daySpan(request.day, request.day);
  const branch = request.branch.trim();
  return {
    built: bankSignAsk({ customer: ctx.customerName, bank, branch, day }, id),
    record: recordOf(
      'bank_sign',
      task,
      id,
      `bank_sign:${task.id}`,
      `Sign loan papers at ${bank}`,
      `Asked the customer to sign the loan papers at ${bank}, ${branch} on ${day} (WhatsApp)`,
      { bank, branch, day: request.day, dayText: day },
    ),
  };
}

/** The roof layout (a report or an uploaded document) to look at and approve. */
export async function layoutCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'send_layout'>,
  id: string,
): Promise<Composed> {
  const task = await allowedTask(deps, ctx, request.taskId, STEP_TASK_KEYS.layout);
  const paper = await resolvePaper(deps, ctx, request.paperId);
  const home = await homeNameOf(deps.db, task.projectId);
  return {
    built: layoutAsk(
      { customer: ctx.customerName, paper, home, link: sharedFileUrl(deps.env, paper.file) },
      id,
    ),
    record: recordOf(
      'layout',
      task,
      id,
      `layout:${task.id}`,
      `Approve layout: ${paper.title}`,
      `Sent the layout ${paper.title} to the customer for approval (WhatsApp)`,
      { paperId: paper.id, paperTitle: paper.title },
    ),
  };
}
