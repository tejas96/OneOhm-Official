import { loanTranches, type Transaction } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { eq, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

type LoanStatus =
  | 'collecting_documents'
  | 'submitted'
  | 'sanctioned'
  | 'disbursing'
  | 'disbursed'
  | 'rejected';

export interface TrancheInput {
  id?: string | null | undefined;
  label: string;
  amountPaise: number;
  expectedOn?: string | null | undefined;
  claimed?: boolean | undefined;
}

export interface LoanInput {
  version: number | null;
  lendingPartnerId?: string | null | undefined;
  lenderName: string;
  applicationNumber?: string | null | undefined;
  status: LoanStatus;
  sanctionedPaise?: number | null | undefined;
  sanctionedOn?: string | null | undefined;
  documents: { name: string; received: boolean }[];
  notes?: string | null | undefined;
  tranches: TrancheInput[];
}

/**
 * Makes the loan's tranches match what finance saved. A received tranche is history:
 * it must stay, unchanged; everything else can be added, edited or removed.
 */
export async function syncTranches(
  tx: Transaction,
  loanId: string,
  wanted: readonly TrancheInput[],
): Promise<void> {
  const existing = await tx.select().from(loanTranches).where(eq(loanTranches.loanId, loanId));
  for (const tranche of existing.filter((entry) => entry.status === 'received')) {
    const kept = wanted.find((entry) => entry.id === tranche.id);
    if (!kept || kept.amountPaise !== tranche.amountPaise) {
      throw invalid('A received tranche cannot be removed or changed.', {
        tranches: `"${tranche.label}" is already received.`,
      });
    }
  }
  const keepIds = new Set(wanted.map((entry) => entry.id).filter(Boolean));
  const removed = existing
    .filter((entry) => entry.status !== 'received' && !keepIds.has(entry.id))
    .map((entry) => entry.id);
  if (removed.length) await tx.delete(loanTranches).where(inArray(loanTranches.id, removed));

  for (const [position, entry] of wanted.entries()) {
    const match = existing.find((tranche) => tranche.id === entry.id);
    if (match?.status === 'received') {
      await tx.update(loanTranches).set({ position }).where(eq(loanTranches.id, match.id));
      continue;
    }
    const status = entry.claimed ? ('claimed' as const) : ('planned' as const);
    const values = {
      label: entry.label,
      amountPaise: entry.amountPaise,
      expectedOn: entry.expectedOn ?? null,
      status,
      claimedOn: entry.claimed ? (match?.claimedOn ?? todayIn()) : null,
      position,
    };
    if (match) await tx.update(loanTranches).set(values).where(eq(loanTranches.id, match.id));
    else await tx.insert(loanTranches).values({ loanId, ...values });
  }
}
