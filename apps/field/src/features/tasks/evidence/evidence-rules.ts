import type { ProjectTask } from '@oneohm/api-contracts';
import { type DocumentCategory, SIGNATURE_CATEGORY } from '@oneohm/domain';
import type { QueuedUpload } from '@/features/uploads/queue-logic';

type TaskInfo = Pick<ProjectTask, 'templateKey' | 'stage'>;

const BY_TEMPLATE: Readonly<Record<string, DocumentCategory>> = {
  site_survey: 'site_survey',
  electricity_details: 'electricity_bill',
  society_documents: 'customer_kyc',
  name_change: 'discom',
  purchase_order: 'vendor',
  battery_procurement: 'vendor',
  dcr_undertaking: 'subsidy',
  handover: 'commissioning_handover',
  testing_commissioning: 'commissioning_handover',
};

const BY_STAGE: Readonly<Partial<Record<ProjectTask['stage'], DocumentCategory>>> = {
  net_metering: 'discom',
  subsidy: 'subsidy',
  commissioning: 'commissioning_handover',
};

/**
 * The library folder a document added on a task goes to, so a bill lands with the bills
 * and a sanction letter with DISCOM papers; anything else is filed under Other.
 */
export function documentCategoryFor(task: TaskInfo): DocumentCategory {
  const known = BY_TEMPLATE[task.templateKey];
  if (known) return known;
  if (/loan|bank/.test(task.templateKey)) return 'bank_loan';
  return BY_STAGE[task.stage] ?? 'other';
}

export const isSignatureFile = (file: { readonly category: string }) =>
  file.category === SIGNATURE_CATEGORY;

/** Ticks and measurements are saved with the completion, so their state is on the phone. */
export function checklistDone(task: ProjectTask, ticked: ReadonlySet<string>): boolean {
  return task.checklist.every((item) => ticked.has(item.key));
}

export function measurementsDone(
  task: ProjectTask,
  facts: Readonly<Record<string, string>>,
): boolean {
  return task.measurements.every((key) => Boolean(facts[key]?.trim()));
}

/** The facts sent with "Complete": typed values plus a fact per ticked checklist item. */
export function completionFacts(
  facts: Readonly<Record<string, string>>,
  ticked: ReadonlySet<string>,
  tickValue: string,
): Record<string, string> {
  return { ...facts, ...Object.fromEntries([...ticked].map((key) => [key, tickValue])) };
}

/** Uploads for the task split by tile: the signature has its own card. */
export function splitQueued(items: readonly QueuedUpload[]) {
  return {
    files: items.filter((item) => item.kind !== 'signature'),
    signatures: items.filter((item) => item.kind === 'signature'),
  };
}
