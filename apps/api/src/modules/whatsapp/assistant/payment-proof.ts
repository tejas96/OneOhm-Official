import {
  customers,
  type DatabaseExecutor,
  notifyHolders,
  paymentMilestones,
  projectActivities,
  projects,
} from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { filePaper } from '../file-paper';
import { answersRequests, type KeptFile } from './kept-files';

/** Reminders for the instalment wait this long after the customer says they paid. */
export const PAUSE_DAYS = 2;
const DAY = 86_400_000;

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
  const [only] = projectIds.length === 1 ? due : [];
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
  if (only)
    await tx.insert(projectActivities).values({
      projectId: only.projectId,
      kind: 'whatsapp_file',
      message: `${name} sent payment proof on WhatsApp`,
      data: { documentId: first?.id },
    });
  await notifyHolders(tx, 'finance.record_payments', {
    kind: 'payment_proof',
    title: `Record payment: ${name} sent payment proof`,
    body: `${name} sent ${files.length === 1 ? 'a file' : `${files.length} files`} on WhatsApp as proof of payment. Check it in their documents and record the payment; reminders wait 2 days.`,
    ...(only
      ? { subject: { type: 'project' as const, id: only.projectId, projectId: only.projectId } }
      : {}),
    dedupeKey: `payment_proof:${first?.id ?? now}`,
  });
}
