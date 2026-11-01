import { createHash } from 'node:crypto';
import { type DatabaseExecutor, payoutAccounts } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import type { Payee } from './payees';
import type { BankDetails, PayoutGateway } from './payout-gateway';

/** Same name, IFSC and number: same fund account. Stored as a hash, never in clear. */
const fingerprintOf = (bank: BankDetails) =>
  createHash('sha256')
    .update(`${bank.name.toLowerCase()}|${bank.ifsc}|${bank.accountNumber}`)
    .digest('hex');

/**
 * The payee's RazorpayX fund account, made once (a contact plus the bank account) and
 * reused while their bank details stay the same.
 */
export async function fundAccountFor(
  db: DatabaseExecutor,
  gateway: PayoutGateway,
  payee: Payee,
  bank: BankDetails,
): Promise<string> {
  const fingerprint = fingerprintOf(bank);
  const [known] = await db
    .select({ fundAccountId: payoutAccounts.fundAccountId })
    .from(payoutAccounts)
    .where(
      and(
        eq(payoutAccounts.payeeKind, payee.kind),
        eq(payoutAccounts.payeeId, payee.id),
        eq(payoutAccounts.provider, gateway.provider),
        eq(payoutAccounts.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  if (known) return known.fundAccountId;
  const contactId = await gateway.createContact({
    name: payee.name,
    referenceId: `${payee.kind}-${payee.id}`,
    phone: payee.phone,
  });
  const fundAccountId = await gateway.createFundAccount(contactId, bank);
  await db
    .insert(payoutAccounts)
    .values({
      payeeKind: payee.kind,
      payeeId: payee.id,
      provider: gateway.provider,
      contactId,
      fundAccountId,
      fingerprint,
    })
    .onConflictDoNothing();
  return fundAccountId;
}
