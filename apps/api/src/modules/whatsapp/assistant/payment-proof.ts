import {
  customers,
  type DatabaseExecutor,
  notifyHolders,
  paymentMilestones,
  projectActivities,
  projects,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { proofReceived } from '../../send-to-customer/pay-actions';
import { filePaper } from '../file-paper';
import { answersRequests, type KeptFile } from './kept-files';

/** Reminders for the instalment wait this long after the customer says they paid. */
export const PAUSE_DAYS = 2;
const DAY = 86_400_000;

/** The instalment, amount and day a customer gave with their proof. */
export interface ProofDetail {
  readonly milestoneId?: string | null;
  readonly amountPaise?: number | null;
  /** YYYY-MM-DD. */
  readonly paidOn?: string | null;
}

/**
 * A customer sent proof of a payment they made another way (redesign 10): the files are kept
 * as "Payment proof" on the project that is due, finance is alerted to record the payment,
 * and the reminders for the customer's due instalments wait 2 days (recording a payment
 * ends the wait). Returns the project the proof was filed on, if there is one.
 */
export async function takePaymentProof(
  tx: DatabaseExecutor,
  customerId: string,
  files: readonly KeptFile[],
  now: number,
  /** What the "I paid another way" form told us, when it was used. */
  detail: ProofDetail = {},
): Promise<void> {
  const [customer] = await tx
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId));
  const due = await tx
    .select({
      id: paymentMilestones.id,
      projectId: paymentMilestones.projectId,
      propertyId: projects.propertyId,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .where(
      and(
        eq(projects.customerId, customerId),
        eq(paymentMilestones.payer, 'customer'),
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
      ),
    );
  const projectIds = [...new Set(due.map((row) => row.projectId))];
  // One project owes: the proof sits on it. Several (or none): it stays with the customer.
  const named = detail.milestoneId ? due.find((row) => row.id === detail.milestoneId) : undefined;
  const [single] = projectIds.length === 1 ? due : [];
  const only = named ?? single;
  const place = {
    projectId: only?.projectId ?? null,
    propertyId: only?.propertyId ?? null,
  };
  for (const file of files)
    await filePaper(tx, file.id, {
      ...place,
      category: answersRequests(file.contentType) ? 'payment_proof' : 'other',
    });
  if (due.length > 0)
    await tx
      .update(paymentMilestones)
      .set({ remindersPausedUntil: new Date(now + PAUSE_DAYS * DAY), updatedAt: new Date(now) })
      .where(
        inArray(
          paymentMilestones.id,
          due.map((row) => row.id),
        ),
      );
  const [first] = files;
  const name = customer?.name ?? 'A customer';
  // The customer actions that asked for the proof now wait for finance to record it.
  await proofReceived(tx, customerId, detail.milestoneId ?? null, {
    documentId: first?.id ?? null,
    amountPaise: detail.amountPaise ?? null,
    paidOn: detail.paidOn ?? null,
  });
  if (only)
    await tx.insert(projectActivities).values({
      projectId: only.projectId,
      kind: 'whatsapp_file',
      message: `${name} sent payment proof on WhatsApp`,
      data: { documentId: first?.id },
    });
  await alertFinance(tx, {
    name,
    count: files.length,
    firstId: first?.id ?? null,
    only,
    detail,
    now,
  });
}

/** Finance is asked to check the proof and record the payment (with what the customer told). */
async function alertFinance(
  tx: DatabaseExecutor,
  about: {
    name: string;
    count: number;
    firstId: string | null;
    only: { projectId: string } | undefined;
    detail: ProofDetail;
    now: number;
  },
) {
  const { name, count, firstId, only, detail, now } = about;
  const told = [
    detail.amountPaise ? formatInr(detail.amountPaise) : null,
    detail.paidOn ? `on ${detail.paidOn}` : null,
  ].filter(Boolean);
  await notifyHolders(tx, 'finance.record_payments', {
    kind: 'payment_proof',
    title: `Record payment: ${name} sent payment proof`,
    body: `${name} sent ${count === 1 ? 'a file' : `${count} files`} on WhatsApp as proof of payment${told.length ? ` (${told.join(' ')})` : ''}. Check it in their documents and record the payment; reminders wait 2 days.`,
    ...(only
      ? { subject: { type: 'project' as const, id: only.projectId, projectId: only.projectId } }
      : {}),
    dedupeKey: `payment_proof:${firstId ?? now}`,
  });
}
