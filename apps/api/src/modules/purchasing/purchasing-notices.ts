import {
  type DatabaseExecutor,
  notify,
  notifyHolders,
  type purchaseRequests,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import type { Actor } from '../../common/auth/actor';

type RequestRow = typeof purchaseRequests.$inferSelect;
type Outcome = 'approved' | 'rejected' | 'ordered' | 'cancelled';

const TITLE: Readonly<Record<Outcome, (number: string) => string>> = {
  approved: (number) => `Purchase request ${number} approved`,
  rejected: (number) => `Purchase request ${number} rejected`,
  ordered: (number) => `Purchase request ${number} is on order`,
  cancelled: (number) => `Purchase request ${number} cancelled`,
};

const FALLBACK: Readonly<Record<Outcome, string>> = {
  approved: 'Procurement will raise the purchase order.',
  rejected: 'No reason was given.',
  ordered: 'A purchase order has been raised.',
  cancelled: 'It will not be ordered.',
};

/** Tells the person who raised a request what was decided, unless they did it themselves. */
export async function tellRequester(
  db: DatabaseExecutor,
  actor: Actor,
  request: RequestRow,
  outcome: Outcome,
  note: string | null,
): Promise<void> {
  if (request.requestedByUserId === actor.userId) return;
  await notify(
    db,
    { userId: request.requestedByUserId },
    {
      kind: 'purchase_request',
      title: TITLE[outcome](request.number),
      body: note ? `${actor.fullName}: ${note}` : `${actor.fullName}. ${FALLBACK[outcome]}`,
      subject: { type: 'purchase_request', id: request.id, projectId: request.projectId },
      dedupeKey: `purchase_request:${request.id}:${outcome}`,
    },
  );
}

/** Approvers hear about a new vendor advance waiting for them. */
export async function tellApprovers(
  db: DatabaseExecutor,
  actor: Actor,
  advance: { readonly id: string; readonly number: string; readonly amountPaise: number },
  context: { readonly vendor: string; readonly order: string; readonly projectId: string | null },
): Promise<void> {
  await notifyHolders(
    db,
    'finance.approve_payments',
    {
      kind: 'vendor_advance',
      title: `Vendor advance ${advance.number} to approve`,
      body: `${actor.fullName} recorded ${formatInr(advance.amountPaise)} to ${context.vendor} against ${context.order}.`,
      subject: { type: 'vendor_advance', id: advance.id, projectId: context.projectId },
      dedupeKey: `vendor_advance:${advance.id}:recorded`,
    },
    actor.userId,
  );
}
