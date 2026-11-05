import {
  customerActions,
  customers,
  type DatabaseExecutor,
  homeNameOf,
  noticeCustomer,
  visits,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { languageOfPhone } from '../documents/document-request-messages';
import { cancelVisit } from '../visits/visit-store';
import { inLanguage } from '../whatsapp/assistant/language';
import { queueReply } from '../whatsapp/chat-store';
import { settleCancelledAsk } from './send-cancel';
import { SEND_WORDS } from './send-words';

export type CancelScope = { readonly projectId: string } | { readonly leadId: string };

/**
 * The project is cancelled or the lead is lost (redesign §2.2): everything still asked of the customer
 * there is cancelled (and what each took with it settled), visits that were proposed or confirmed are
 * cancelled, one line goes in the log, and the customer hears ONCE ("We have closed everything we asked
 * from you for {home}"): always in the app inbox, in the chat only while its window is open and they have
 * not said STOP. Nothing is said when nothing was open. Runs in the caller's transaction; saying it again
 * finds nothing open and says nothing.
 *
 * No API path cancels projects today; the project path calls this with `{ projectId }`.
 */
export async function cancelAllAsks(
  tx: DatabaseExecutor,
  scope: CancelScope,
  userId: string,
  reason: string,
): Promise<number> {
  const scopeId = 'projectId' in scope ? scope.projectId : scope.leadId;
  const inScope =
    'projectId' in scope
      ? eq(customerActions.projectId, scope.projectId)
      : or(
          eq(customerActions.leadId, scope.leadId),
          sql`${customerActions.payload}->>'leadId' = ${scope.leadId}`,
        );
  const asks = await tx
    .select()
    .from(customerActions)
    .where(and(inScope, inArray(customerActions.status, ['open', 'received'])));
  const now = new Date();
  for (const ask of asks) {
    await tx
      .update(customerActions)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(eq(customerActions.id, ask.id));
    await settleCancelledAsk(tx, ask, userId);
    await recordAudit(tx, userId, 'customer_action.cancelled', 'customer_action', ask.id, {
      reason,
    });
  }
  const planned = await tx
    .select()
    .from(visits)
    .where(
      and(
        'projectId' in scope
          ? eq(visits.projectId, scope.projectId)
          : eq(visits.leadId, scope.leadId),
        inArray(visits.status, ['proposed', 'confirmed']),
      ),
    );
  for (const visit of planned) await cancelVisit(tx, visit, userId, reason, 'Visit');
  const total = asks.length + planned.length;
  if (total === 0) return 0;
  await logAction(
    tx,
    'projectId' in scope
      ? { projectId: scope.projectId, leadId: null }
      : { projectId: null, leadId: scope.leadId },
    {
      kind: 'customer_action',
      message: `Cancelled ${total} customer request${total === 1 ? '' : 's'} (${reason})`,
      userId,
      data: { reason, count: total },
    },
  );
  // A paper already sent and waiting for its check is not something the customer still has to do.
  const waiting = asks.some((ask) => ask.status === 'open') || planned.length > 0;
  if (waiting) {
    const first = asks[0];
    const home = await homeNameOf(
      tx,
      first?.projectId ?? ('projectId' in scope ? scope.projectId : null),
      first?.propertyId ?? planned[0]?.propertyId ?? null,
    );
    const owners = [
      ...new Set([...asks.map((a) => a.customerId), ...planned.map((v) => v.customerId)]),
    ];
    await tellOnce(tx, owners, home, `asks_cancelled:${scopeId}`, userId);
  }
  return total;
}

/** One message to each customer: the app inbox always, the chat only inside its window and not after STOP. */
async function tellOnce(
  tx: DatabaseExecutor,
  customerIds: readonly string[],
  home: string,
  key: string,
  userId: string,
): Promise<void> {
  const people = await tx
    .select({ phone: customers.phoneE164 })
    .from(customers)
    .where(inArray(customers.id, [...customerIds]));
  for (const { phone } of people) {
    await inLanguage(await languageOfPhone(tx, phone), async () => {
      const words = SEND_WORDS.cancelled;
      const body = words.all(home);
      await noticeCustomer(tx, phone, 'action_cancelled', { what: words.allWhat, note: body }, key);
      const [chat] = await tx
        .select()
        .from(waConversations)
        .where(eq(waConversations.phone, phone))
        .limit(1);
      if (!chat || chat.optedOutAt || !chatWindowOpen(chat.lastInboundAt)) return;
      await queueReply(tx, chat, { kind: 'text', body }, userId, key);
    });
  }
}
