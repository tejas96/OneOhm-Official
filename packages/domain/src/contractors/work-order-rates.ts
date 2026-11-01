import type { ProjectType } from '../epc/stages';

/** How a contractor charges (PRD 3.13): per kWp installed, per job, per day or per task. */
export const RATE_BASES = ['per_kwp', 'per_job', 'per_day', 'per_task'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export interface ContractorRate {
  readonly id: string;
  readonly basis: RateBasis;
  /** For per-task rates: the task template key it pays for. */
  readonly taskKey: string | null;
  /** Null applies to every project type; a matching type wins over null. */
  readonly projectType: ProjectType | null;
  readonly label: string;
  readonly amountPaise: number;
}

export interface WorkOrderLineDraft {
  readonly rateId: string | null;
  readonly basis: RateBasis;
  readonly taskKey: string | null;
  readonly description: string;
  /** Thousandths, so 5.45 kWp is 5450. */
  readonly quantityMilli: number;
  readonly unitRatePaise: number;
  readonly amountPaise: number;
}

const toRupee = (paise: number) => Math.round(paise / 100) * 100;

function pick(
  rates: readonly ContractorRate[],
  projectType: ProjectType,
  match: (rate: ContractorRate) => boolean,
): ContractorRate | undefined {
  const candidates = rates.filter(
    (rate) => match(rate) && (rate.projectType === null || rate.projectType === projectType),
  );
  return candidates.find((rate) => rate.projectType === projectType) ?? candidates[0];
}

/**
 * The lines a work order pays, from the contractor's rate card: one per-kWp line for the
 * installed capacity, one per-job line, and a line for each task with its own rate.
 * Per-day labour is added by hand, because the number of days is not known up front.
 */
export function workOrderLines(input: {
  readonly rates: readonly ContractorRate[];
  readonly tasks: readonly { readonly templateKey: string; readonly title: string }[];
  readonly capacityWp: number;
  readonly projectType: ProjectType;
}): WorkOrderLineDraft[] {
  const { rates, tasks, capacityWp, projectType } = input;
  const lines: WorkOrderLineDraft[] = [];
  const perKwp = pick(rates, projectType, (rate) => rate.basis === 'per_kwp');
  if (perKwp && capacityWp > 0) {
    lines.push({
      rateId: perKwp.id,
      basis: 'per_kwp',
      taskKey: null,
      description: perKwp.label,
      quantityMilli: capacityWp,
      unitRatePaise: perKwp.amountPaise,
      amountPaise: toRupee((perKwp.amountPaise * capacityWp) / 1000),
    });
  }
  const perJob = pick(rates, projectType, (rate) => rate.basis === 'per_job');
  if (perJob) {
    lines.push({
      rateId: perJob.id,
      basis: 'per_job',
      taskKey: null,
      description: perJob.label,
      quantityMilli: 1000,
      unitRatePaise: perJob.amountPaise,
      amountPaise: perJob.amountPaise,
    });
  }
  for (const task of tasks) {
    const rate = pick(
      rates,
      projectType,
      (candidate) => candidate.basis === 'per_task' && candidate.taskKey === task.templateKey,
    );
    if (!rate) continue;
    lines.push({
      rateId: rate.id,
      basis: 'per_task',
      taskKey: task.templateKey,
      description: `${rate.label} · ${task.title}`,
      quantityMilli: 1000,
      unitRatePaise: rate.amountPaise,
      amountPaise: rate.amountPaise,
    });
  }
  return lines;
}
