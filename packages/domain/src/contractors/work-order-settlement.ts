/** What OneOhm owes a contractor for a finished work order (PRD 3.13). */
export interface WorkOrderSettlement {
  readonly grossPaise: number;
  readonly reworkDeductionsPaise: number;
  readonly retentionPaise: number;
  readonly tdsPaise: number;
  readonly advancesPaise: number;
  /** Paid now: gross less rework, retention, TDS and advances already paid. */
  readonly netPayablePaise: number;
}

const toRupee = (paise: number) => Math.round(paise / 100) * 100;

/**
 * Rework deductions come off the gross first. Retention (held back until the defect
 * period ends) and TDS (deposited with the government, not paid to the contractor) are
 * shares of what is left. Advances already paid are then deducted. Never below zero.
 */
export function settleWorkOrder(input: {
  readonly lineAmountsPaise: readonly number[];
  readonly reworkDeductionsPaise: number;
  readonly advancesPaise: number;
  readonly retentionBp: number;
  readonly tdsBp: number;
}): WorkOrderSettlement {
  const grossPaise = input.lineAmountsPaise.reduce((sum, amount) => sum + amount, 0);
  const reworkDeductionsPaise = Math.min(grossPaise, Math.max(0, input.reworkDeductionsPaise));
  const base = grossPaise - reworkDeductionsPaise;
  const retentionPaise = toRupee((base * input.retentionBp) / 10_000);
  const tdsPaise = toRupee((base * input.tdsBp) / 10_000);
  const advancesPaise = Math.max(0, input.advancesPaise);
  return {
    grossPaise,
    reworkDeductionsPaise,
    retentionPaise,
    tdsPaise,
    advancesPaise,
    netPayablePaise: Math.max(0, base - retentionPaise - tdsPaise - advancesPaise),
  };
}
