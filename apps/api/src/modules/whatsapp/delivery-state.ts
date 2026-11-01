import type { Delivery } from '@oneohm/api-contracts';
import type { outbox } from '@oneohm/database';

type Row = Pick<typeof outbox.$inferSelect, 'status' | 'deliveryStatus'>;

/** How far a message got: the receipt from WhatsApp when there is one, else the outbox state. */
export function deliveryState(row: Row): Delivery['state'] {
  if (row.status === 'failed' || row.deliveryStatus === 'failed') return 'failed';
  if (row.deliveryStatus === 'read' || row.deliveryStatus === 'delivered')
    return row.deliveryStatus;
  if (row.status === 'sent') return 'sent';
  return row.status === 'skipped' ? 'skipped' : 'pending';
}

const RANK: Readonly<Record<string, number>> = { sent: 1, delivered: 2, read: 3 };

/** Receipts can arrive out of order; a message never goes back from read to delivered. */
export function laterStatus(current: string | null, next: string): boolean {
  if (next === 'failed') return current !== 'read';
  return (RANK[next] ?? 0) > (RANK[current ?? ''] ?? 0);
}
