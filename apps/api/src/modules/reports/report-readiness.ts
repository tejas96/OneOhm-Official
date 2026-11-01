import type { ReportStatus } from '@oneohm/api-contracts';
import { factLabel } from '@oneohm/domain';
import { AppError } from '../../common/http/errors';
import { COMPANY_FIELD_LABELS, type ReportDefinition } from './report-definitions';

/** What readiness needs to know about a project; facts are captured by tasks. */
export interface ReportContext {
  readonly facts: Readonly<Record<string, string>>;
  readonly subsidy: boolean;
  readonly discomCode: string;
  /** Fact key → title of the task that captures it. */
  readonly captureTask: ReadonlyMap<string, string>;
}

const present = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** Ready, missing (which detail, captured by which task) or not needed. */
export function reportStatus(
  definition: ReportDefinition,
  context: ReportContext,
  company: Readonly<Record<string, unknown>>,
): ReportStatus {
  const base = { key: definition.key, name: definition.name };
  if (
    (definition.onlyWithSubsidy && !context.subsidy) ||
    (definition.discomCodes && !definition.discomCodes.includes(context.discomCode))
  ) {
    return { ...base, status: 'not_needed', missing: [] };
  }
  const missing = [
    ...definition.required
      .filter((key) => !present(context.facts[key]))
      .map((key) => ({
        field: key,
        label: factLabel(key),
        taskTitle: context.captureTask.get(key) ?? null,
      })),
    ...(definition.company ?? [])
      .filter((field) => !present(company[field]))
      .map((field) => ({ field, label: COMPANY_FIELD_LABELS[field], taskTitle: null })),
  ];
  return { ...base, status: missing.length ? 'missing' : 'ready', missing };
}

/**
 * Refuses to print a report that is not ready: 409 with every missing detail in
 * `fieldErrors`, so the person sees exactly what to capture and in which task.
 */
export function assertReportReady(status: ReportStatus): void {
  if (status.status === 'not_needed') {
    throw new AppError(409, `${status.name} is not needed for this project.`, 'report_not_needed');
  }
  if (status.status === 'ready') return;
  const fieldErrors = Object.fromEntries(
    status.missing.map((item) => [
      item.field,
      item.taskTitle ? `${item.label} — captured in "${item.taskTitle}"` : item.label,
    ]),
  );
  const labels = status.missing.map((item) => item.label);
  throw new AppError(
    409,
    `${status.name} needs ${labels.length} more ${labels.length === 1 ? 'detail' : 'details'}: ${labels.join(', ')}.`,
    'report_not_ready',
    fieldErrors,
  );
}
