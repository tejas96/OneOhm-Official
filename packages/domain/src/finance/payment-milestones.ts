/**
 * Customer payment milestones (PRD 3.11, Flow B, Flow D). Each milestone has a payer
 * (customer or bank) and the business event that makes it due. Defaults follow the
 * MNRE model agreement: 25% advance, 65% before dispatch, 10% after commissioning.
 */
export const MILESTONE_TRIGGERS = [
  'quotation_accepted',
  'material_dispatch',
  'commissioning_completed',
  'loan_disbursement',
] as const;
export type MilestoneTrigger = (typeof MILESTONE_TRIGGERS)[number];

export type Payer = 'customer' | 'bank';

export interface MilestoneShare {
  readonly key: string;
  readonly label: string;
  readonly shareBp: number;
  readonly trigger: MilestoneTrigger;
}

export const DEFAULT_MILESTONES: readonly MilestoneShare[] = [
  {
    key: 'advance',
    label: 'Advance on order confirmation',
    shareBp: 2500,
    trigger: 'quotation_accepted',
  },
  {
    key: 'before_dispatch',
    label: 'Before dispatch of panels and inverter',
    shareBp: 6500,
    trigger: 'material_dispatch',
  },
  {
    key: 'final',
    label: 'After installation and commissioning',
    shareBp: 1000,
    trigger: 'commissioning_completed',
  },
];

export interface PlannedMilestone {
  readonly key: string;
  readonly label: string;
  readonly payer: Payer;
  readonly amountPaise: number;
  readonly trigger: MilestoneTrigger;
}

/**
 * Splits the project price into milestones. With a loan, the bank's share becomes its
 * own receivable (single disbursement here; tranches are added by finance), and the
 * customer's own share follows the usual schedule. The last milestone takes rounding.
 */
export function planMilestones(
  totalPaise: number,
  schedule: readonly MilestoneShare[] = DEFAULT_MILESTONES,
  loanPaise = 0,
): readonly PlannedMilestone[] {
  const bank = Math.min(Math.max(0, loanPaise), totalPaise);
  const customerTotal = totalPaise - bank;
  const totalBp = schedule.reduce((sum, item) => sum + item.shareBp, 0) || 1;
  let allocated = 0;
  const customer = schedule.map((item, index): PlannedMilestone => {
    const last = index === schedule.length - 1;
    const amountPaise = last
      ? customerTotal - allocated
      : Math.round((customerTotal * item.shareBp) / totalBp);
    allocated += amountPaise;
    return {
      key: item.key,
      label: item.label,
      payer: 'customer',
      amountPaise,
      trigger: item.trigger,
    };
  });
  const bankMilestones: PlannedMilestone[] =
    bank > 0
      ? [
          {
            key: 'bank_disbursement',
            label: 'Bank loan disbursement',
            payer: 'bank',
            amountPaise: bank,
            trigger: 'loan_disbursement',
          },
        ]
      : [];
  return [...customer.filter((item) => item.amountPaise > 0), ...bankMilestones];
}
