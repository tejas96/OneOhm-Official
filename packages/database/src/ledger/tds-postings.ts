import { tdsDepositPosting } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { tdsDeposits } from '../schema';
import { postJournal } from './post-journal';

/**
 * TDS deposited with the government (PRD 3.11): what was owed to it comes off TDS
 * payable, and the bank pays it. Booked once, on the challan date.
 */
export async function postTdsDeposit(
  db: DatabaseExecutor,
  depositId: string,
  userId: string | null,
): Promise<void> {
  const [deposit] = await db
    .select()
    .from(tdsDeposits)
    .where(eq(tdsDeposits.id, depositId))
    .limit(1);
  if (!deposit || deposit.amountPaise <= 0) return;
  await postJournal(db, {
    entryDate: deposit.depositedOn,
    memo: `TDS deposited · ${deposit.section} · ${deposit.month} · Challan ${deposit.challanNumber}`,
    sourceType: 'tds_deposit',
    sourceId: deposit.id,
    postedByUserId: userId,
    lines: tdsDepositPosting({ amountPaise: deposit.amountPaise }),
  });
}
