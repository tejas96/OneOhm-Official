import { employeeBonusPosting } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { payables, projects } from '../schema';
import { postJournal } from './post-journal';
import { businessDate } from './receivable-postings';

/**
 * An approved bonus share, booked as a staff bonus (not travel) and owed to the employee
 * (PRD 4.7). It uses the payable's own "approved" posting slot, so the general backfill
 * never books it a second time; paying it is the ordinary payable payment.
 */
export async function postBonusPayableApproved(
  db: DatabaseExecutor,
  payableId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({ payable: payables, code: projects.code })
    .from(payables)
    .leftJoin(projects, eq(projects.id, payables.projectId))
    .where(eq(payables.id, payableId))
    .limit(1);
  if (!row || row.payable.status === 'pending' || row.payable.party !== 'employee') return;
  const { payable } = row;
  await postJournal(db, {
    entryDate: businessDate(payable.approvedAt ?? payable.updatedAt),
    memo: [
      'Bonus approved',
      row.code,
      payable.partyName,
      payable.description.replace(/^Bonus · /, ''),
    ]
      .filter(Boolean)
      .join(' · '),
    sourceType: 'payable_approved',
    sourceId: payable.id,
    projectId: payable.projectId,
    postedByUserId: userId,
    lines: employeeBonusPosting({ amountPaise: payable.amountPaise }),
  });
}
