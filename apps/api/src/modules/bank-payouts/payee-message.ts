import { brandName, type DatabaseExecutor, messageTemplates, outbox } from '@oneohm/database';
import { PAYEE_PAID_TEMPLATE, type PayeeTold } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { payeeOf } from './payees';
import type { PayoutRow } from './payout-alerts';

/** The last four digits of an account, from the masked form ("•••• 1234"). */
export const lastFour = (masked: string): string => masked.replace(/\D/g, '').slice(-4);

/** A calendar day as people say it, for example "5 Nov 2026". */
export function sayDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The values that fill the `vendor_paid` template, in plain words. Never the full account. */
export function paidMessageValues(input: {
  payeeName: string;
  amountPaise: number;
  company: string;
  utr: string | null;
  paidOn: string;
  accountMasked: string;
}): Record<string, string> {
  return {
    payee: input.payeeName,
    amount: formatInr(input.amountPaise),
    company: input.company,
    utr: input.utr ?? 'not given yet',
    date: sayDay(input.paidOn),
    last4: lastFour(input.accountMasked),
  };
}

/**
 * Tells the payee by WhatsApp that the bank transfer reached them, queued in the caller's
 * transaction so it exists only if the payment was recorded. It goes only while the
 * `vendor_paid` message is switched on in Settings → Messages (the owner does that once Meta
 * approves it); a payee with no phone cannot be told. Says what happened, to keep on the payout.
 */
export async function tellPayee(
  tx: DatabaseExecutor,
  row: PayoutRow,
  paidOn: string,
  utr: string | null,
): Promise<PayeeTold> {
  const payee = await payeeOf(tx, row.payableId);
  if (!payee?.phone) return 'no_phone';
  const [config] = await tx
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, PAYEE_PAID_TEMPLATE))
    .limit(1);
  // No row (a database not migrated yet) counts as off: Meta has not approved it.
  if (!config?.active) return 'off';
  await tx
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: payee.phone,
      template: PAYEE_PAID_TEMPLATE,
      payload: paidMessageValues({
        payeeName: payee.name,
        amountPaise: row.amountPaise,
        company: await brandName(tx),
        utr,
        paidOn,
        accountMasked: row.accountMasked,
      }),
      dedupeKey: `${PAYEE_PAID_TEMPLATE}:${row.id}`,
    })
    .onConflictDoNothing();
  return 'sent';
}
