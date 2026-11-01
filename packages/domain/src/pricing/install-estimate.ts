import { type ContractorRate, workOrderLines } from '../contractors/work-order-rates';
import type { ProjectType } from '../epc/stages';

const toRupee = (paise: number) => Math.round(paise / 100) * 100;

export interface ContractorJob {
  readonly rates: readonly ContractorRate[];
  readonly tasks: readonly { readonly templateKey: string; readonly title: string }[];
  readonly capacityWp: number;
  readonly projectType: ProjectType;
  /** Crew person-days the quotation planned; a day rate is paid for these. */
  readonly personDays: number;
}

export interface InstallEstimate {
  readonly amountPaise: number;
  readonly source: 'contractor' | 'company';
}

function dayRate(job: ContractorJob): ContractorRate | undefined {
  const days = job.rates.filter(
    (rate) =>
      rate.basis === 'per_day' &&
      (rate.projectType === null || rate.projectType === job.projectType),
  );
  return days.find((rate) => rate.projectType === job.projectType) ?? days[0];
}

/**
 * The estimated installation cost (PRD 3.13 "contractor rates feed estimates", D12):
 * with a contractor on the project, what its rate card pays — per kWp, per job, per
 * task, and its day rate for the crew days the quotation planned. Without one, or when
 * its card prices nothing, the company's own labour cost from the quotation stands.
 */
export function installEstimate(
  companyLabourPaise: number,
  contractor: ContractorJob | null,
): InstallEstimate {
  if (!contractor) return { amountPaise: companyLabourPaise, source: 'company' };
  const lines = workOrderLines(contractor);
  const perDay = dayRate(contractor);
  const days = perDay ? toRupee(perDay.amountPaise * contractor.personDays) : 0;
  const amountPaise = lines.reduce((sum, line) => sum + line.amountPaise, 0) + days;
  return amountPaise > 0
    ? { amountPaise, source: 'contractor' }
    : { amountPaise: companyLabourPaise, source: 'company' };
}
