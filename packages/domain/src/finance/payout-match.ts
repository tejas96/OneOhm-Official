import { formatInr } from '@oneohm/shared';

/** Statuses whose fee RazorpayX credits back. */
const FEE_REFUNDED: readonly string[] = ['failed', 'reversed', 'cancelled', 'rejected'];

/** One OneOhm bank transfer, as the match report needs it. */
export interface OurPayoutRow {
  readonly id: string;
  readonly payableId: string;
  readonly providerPayoutId: string | null;
  readonly status: string;
  readonly amountPaise: number;
  readonly feePaise: number;
}

/** One payout as RazorpayX lists it (its `reference_id` is our payout id). */
export interface RemotePayoutRow {
  readonly id: string;
  readonly referenceId: string | null;
  readonly status: string;
  readonly amountPaise: number;
  readonly feePaise: number;
}

export type PayoutMatchKind = 'only_razorpayx' | 'only_oneohm' | 'status' | 'amount' | 'fee';

export interface PayoutMatchLine {
  readonly kind: PayoutMatchKind;
  /** The bill to open; null when only RazorpayX knows the payout. */
  readonly payableId: string | null;
  readonly payoutId: string | null;
  readonly providerPayoutId: string | null;
  readonly text: string;
}

export interface PayoutMatchResult {
  readonly matched: number;
  readonly counts: Readonly<Record<PayoutMatchKind, number>>;
  readonly lines: readonly PayoutMatchLine[];
}

/** How one of our payouts differs from RazorpayX's record of it, as plain lines. */
function differences(
  our: OurPayoutRow,
  other: RemotePayoutRow,
  base: Omit<PayoutMatchLine, 'kind' | 'text'>,
): PayoutMatchLine[] {
  const lines: PayoutMatchLine[] = [];
  if (other.amountPaise !== our.amountPaise)
    lines.push({
      ...base,
      kind: 'amount',
      text: `Amount differs: OneOhm ${formatInr(our.amountPaise)}, RazorpayX ${formatInr(other.amountPaise)}.`,
    });
  if (other.status !== our.status)
    lines.push({
      ...base,
      kind: 'status',
      text: `Status differs: OneOhm says ${our.status}, RazorpayX says ${other.status}.`,
    });
  // RazorpayX gives the fee back when a payout fails or comes back, so it is not compared then.
  if (!FEE_REFUNDED.includes(other.status) && other.feePaise !== our.feePaise)
    lines.push({
      ...base,
      kind: 'fee',
      text: `Fee differs: OneOhm ${formatInr(our.feePaise)}, RazorpayX ${formatInr(other.feePaise)}.`,
    });
  return lines;
}

/** A transfer that never reached RazorpayX is rightly missing there. */
const NEVER_SENT = new Set(['failed', 'rejected', 'cancelled']);

/**
 * Compares our transfers with RazorpayX's list: by RazorpayX id, else by our reference id.
 * Lists what is only on one side and what differs in status, amount or fee.
 */
export function comparePayouts(
  ours: readonly OurPayoutRow[],
  remote: readonly RemotePayoutRow[],
): PayoutMatchResult {
  const byId = new Map(remote.map((row) => [row.id, row]));
  const byReference = new Map(
    remote.filter((row) => row.referenceId).map((row) => [row.referenceId as string, row]),
  );
  const seen = new Set<string>();
  const lines: PayoutMatchLine[] = [];
  let matched = 0;
  for (const our of ours) {
    const other =
      (our.providerPayoutId ? byId.get(our.providerPayoutId) : undefined) ??
      byReference.get(our.id);
    const base = {
      payableId: our.payableId,
      payoutId: our.id,
      providerPayoutId: other?.id ?? our.providerPayoutId,
    };
    if (!other) {
      if (!our.providerPayoutId && NEVER_SENT.has(our.status)) continue;
      lines.push({
        ...base,
        kind: 'only_oneohm',
        text: `${formatInr(our.amountPaise)} transfer is in OneOhm (${our.status}) but RazorpayX has no record of it.`,
      });
      continue;
    }
    seen.add(other.id);
    const found = differences(our, other, base);
    lines.push(...found);
    if (found.length === 0) matched += 1;
  }
  for (const other of remote) {
    if (seen.has(other.id)) continue;
    lines.push({
      kind: 'only_razorpayx',
      payableId: null,
      payoutId: null,
      providerPayoutId: other.id,
      text: `${formatInr(other.amountPaise)} transfer (${other.status}) is in RazorpayX but not in OneOhm.`,
    });
  }
  const counts: Record<PayoutMatchKind, number> = {
    only_razorpayx: 0,
    only_oneohm: 0,
    status: 0,
    amount: 0,
    fee: 0,
  };
  for (const line of lines) counts[line.kind] += 1;
  return { matched, counts, lines };
}
