import type { SendOffer, SendRequest } from '@oneohm/api-contracts';
import type { SendAction } from '@oneohm/domain';
import type { SendContext } from '../send-to-customer/send-context';
import type { Deps } from '../send-to-customer/send-papers';
import { customerPapers } from '../whatsapp/assistant/customer-papers';
import { DISPATCH_KEY, INSTALLATION_KEY, openTaskByKey, taskFor } from './journey-store';

type Make = (
  key: string,
  label: string,
  detail: string,
  request: SendRequest,
) => Promise<SendOffer>;

/** The journey actions this place offers (redesign §18 10, 13, 14, 16); a step the customer is not messaged about offers nothing. */
export async function journeyOffers(
  deps: Deps,
  ctx: SendContext,
  action: SendAction,
  make: Make,
): Promise<SendOffer[]> {
  const { db } = deps;
  switch (action) {
    case 'send_signature': {
      const task = ctx.taskId ? await taskFor(db, ctx.taskId) : null;
      if (ctx.taskId && !task?.notifyCustomer) return [];
      const papers = await customerPapers(
        { db, portal: deps.portal, documents: deps.documents },
        ctx.customerId,
      );
      const signable = papers.filter(
        (one) => one.file.kind === 'report' || one.file.kind === 'document',
      );
      return Promise.all(
        signable.slice(0, 8).map((paper) =>
          make(
            `sign:${paper.id}`,
            `Send ${paper.title} for signature`,
            paper.description ?? paper.caption,
            {
              action: 'send_signature',
              paperId: paper.id,
              ...(task ? { taskId: task.id } : {}),
            },
          ),
        ),
      );
    }
    case 'ask_site_ready':
    case 'ask_installation_check': {
      const ready = action === 'ask_site_ready';
      const key = ready ? DISPATCH_KEY : INSTALLATION_KEY;
      const task = ctx.taskId
        ? await taskFor(db, ctx.taskId)
        : ctx.projectId
          ? await openTaskByKey(db, ctx.projectId, key)
          : null;
      if (!task || task.templateKey !== key || !task.notifyCustomer) return [];
      if (ready && task.status === 'completed') return [];
      const request: SendRequest = ready
        ? { action: 'ask_site_ready', taskId: task.id }
        : { action: 'ask_installation_check', taskId: task.id };
      return [
        await make(
          `${action}:${task.id}`,
          ready ? 'Ask if the roof is ready' : 'Ask if the installation is finished',
          ready
            ? 'Clear roof, a power point and someone at home.'
            : 'Finished to their satisfaction?',
          request,
        ),
      ];
    }
    case 'send_handover_pack': {
      if (!ctx.projectId) return [];
      const offer = await make(
        'pack',
        'Send the handover pack',
        'Warranty cards, manuals, the Work Completion Report and the invoice.',
        {
          action: 'send_handover_pack',
          projectId: ctx.projectId,
        },
      ).catch(() => null);
      return offer ? [offer] : [];
    }
    default:
      return [];
  }
}
