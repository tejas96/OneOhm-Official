import type { SendOffer, SendRequest } from '@oneohm/api-contracts';
import { projectLoans } from '@oneohm/database';
import { type SendAction, STEP_TASK_KEYS } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { SendContext } from '../send-to-customer/send-context';
import type { Deps } from '../send-to-customer/send-papers';
import { customerPapers } from '../whatsapp/assistant/customer-papers';
import { type JourneyTask, taskByKey, taskFor } from './journey-store';

type Make = (
  key: string,
  label: string,
  detail: string,
  request: SendRequest,
) => Promise<SendOffer>;

/** The step this place speaks of: the task it was pressed on, else the project's task of this kind. */
async function stepTask(deps: Deps, ctx: SendContext, key: string): Promise<JourneyTask | null> {
  const task = ctx.taskId
    ? await taskFor(deps.db, ctx.taskId)
    : ctx.projectId
      ? await taskByKey(deps.db, ctx.projectId, key)
      : null;
  // A step the customer is not messaged about offers nothing (PRD 6.2).
  return task && task.templateKey === key && task.notifyCustomer ? task : null;
}

const LAYOUT_WORDS = /layout|design/i;

/** The subsidy, bank and layout actions this place offers (redesign §18 11, 15); each may offer nothing. */
export async function stepOffers(
  deps: Deps,
  ctx: SendContext,
  action: SendAction,
  make: Make,
): Promise<SendOffer[]> {
  // A message that cannot be built now (nothing to ask about) is simply not offered.
  const offer = async (build: Promise<SendOffer>): Promise<SendOffer[]> => {
    const made = await build.catch(() => null);
    return made ? [made] : [];
  };
  switch (action) {
    case 'ask_subsidy_register': {
      const task = await stepTask(deps, ctx, STEP_TASK_KEYS.subsidy_register);
      if (!task || task.status === 'completed') return [];
      return [
        ...(await offer(
          make(
            `register:${task.id}`,
            'Help to register on the PM Surya Ghar portal',
            'Short steps and the portal address; Done or Need help.',
            { action: 'ask_subsidy_register', taskId: task.id },
          ),
        )),
      ];
    }
    case 'ask_subsidy_credit': {
      const task = await stepTask(deps, ctx, STEP_TASK_KEYS.subsidy_credit);
      if (task?.status !== 'completed') return [];
      return [
        ...(await offer(
          make(
            `credit:${task.id}`,
            'Ask if the subsidy reached their bank',
            'Yes, received or Not yet.',
            { action: 'ask_subsidy_credit', taskId: task.id },
          ),
        )),
      ];
    }
    case 'ask_bank_sign': {
      const task = await stepTask(deps, ctx, STEP_TASK_KEYS.bank_sign);
      if (!task || !ctx.projectId) return [];
      const [loan] = await deps.db
        .select({ bank: projectLoans.lenderName })
        .from(projectLoans)
        .where(eq(projectLoans.projectId, ctx.projectId));
      if (!loan?.bank.trim()) return [];
      return [
        {
          key: `bank:${task.id}`,
          action: 'ask_bank_sign',
          label: 'Ask them to sign the loan papers at the bank',
          detail: `${loan.bank}: give the branch and the day.`,
          request: null,
          input: 'bank_visit',
          preview: null,
        },
      ];
    }
    case 'send_layout': {
      const task = await stepTask(deps, ctx, STEP_TASK_KEYS.layout);
      if (!task) return [];
      const papers = await customerPapers(
        { db: deps.db, portal: deps.portal, documents: deps.documents },
        ctx.customerId,
      );
      const layouts = papers
        .filter((one) => one.file.kind === 'report' || one.file.kind === 'document')
        .sort((a, b) => Number(LAYOUT_WORDS.test(b.title)) - Number(LAYOUT_WORDS.test(a.title)));
      const offers: SendOffer[] = [];
      for (const paper of layouts.slice(0, 8))
        offers.push(
          ...(await offer(
            make(
              `layout:${paper.id}`,
              `Send ${paper.title} for approval`,
              paper.description ?? paper.caption,
              {
                action: 'send_layout',
                paperId: paper.id,
                taskId: task.id,
              },
            ),
          )),
        );
      return offers;
    }
    default:
      return [];
  }
}
