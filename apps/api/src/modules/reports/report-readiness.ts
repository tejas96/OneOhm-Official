import type { ReportStatus } from '@oneohm/api-contracts';
import { factLabel, type ReportTriggerTask, reportWaitsFor } from '@oneohm/domain';
import { AppError } from '../../common/http/errors';
import { COMPANY_FIELD_LABELS, type ReportDefinition } from './report-definitions';

/** What readiness needs to know about a project; facts are captured by tasks. */
export interface ReportContext {
  readonly facts: Readonly<Record<string, string>>;
  readonly subsidy: boolean;
  readonly discomCode: string;
  /** The project's DISCOM, whose report formats print (Settings → DISCOMs). */
  readonly discomId: string;
  /** Fact key → title of the task that captures it. */
  readonly captureTask: ReadonlyMap<string, string>;
  /** The project's tasks, for the task each report waits for (its trigger). */
  readonly tasks?: readonly ReportTriggerTask[];
}

const present = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * Ready, missing (which detail, captured by which task) or not needed. A report also
 * waits for the task that triggers it (installation done for the WCR, commissioning for
 * Annexure-I), so it never prints before the work it certifies.
 */
export function reportStatus(
  definition: ReportDefinition,
  context: ReportContext,
  company: Readonly<Record<string, unknown>>,
): ReportStatus {
  if (definition.onlyWithSubsidy && !context.subsidy) return notNeeded(definition);
  const base = { key: definition.key, name: definition.name };
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
  const waitingFor = reportWaitsFor(definition.key, context.tasks ?? [])?.title ?? null;
  const ready = missing.length === 0 && waitingFor === null;
  return { ...base, status: ready ? 'ready' : 'missing', missing, waitingFor };
}

/** A report the project does not need: its DISCOM has no such format, or no subsidy. */
export function notNeeded(report: { readonly key: string; readonly name: string }): ReportStatus {
  return {
    key: report.key,
    name: report.name,
    status: 'not_needed',
    missing: [],
    waitingFor: null,
  };
}

export interface ProjectReport {
  readonly key: string;
  readonly name: string;
  /** The project's DISCOM's format; null when that DISCOM has none ("not needed"). */
  readonly definition: ReportDefinition | null;
}

/**
 * A project's reports (PRD 3.18): every report any DISCOM prints, so lists line up
 * across projects, each with its own DISCOM's format, or "not needed" when it has none.
 */
export function projectReports(
  all: readonly ReportDefinition[],
  discomId: string,
): ProjectReport[] {
  const keys = [...new Set(all.map((definition) => definition.key))];
  return keys.map((key) => {
    const own = all.find(
      (definition) => definition.key === key && definition.discomId === discomId,
    );
    const name = own?.name ?? all.find((definition) => definition.key === key)?.name ?? key;
    return { key, name, definition: own ?? null };
  });
}

/** Each of the project's reports: ready, missing (and what) or not needed. */
export function projectStatuses(
  all: readonly ReportDefinition[],
  context: ReportContext,
  company: Readonly<Record<string, unknown>>,
): ReportStatus[] {
  return projectReports(all, context.discomId).map((report) =>
    report.definition ? reportStatus(report.definition, context, company) : notNeeded(report),
  );
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
  if (labels.length === 0 && status.waitingFor) {
    throw new AppError(
      409,
      `${status.name} is made once "${status.waitingFor}" is done.`,
      'report_waiting',
    );
  }
  throw new AppError(
    409,
    `${status.name} needs ${labels.length} more ${labels.length === 1 ? 'detail' : 'details'}: ${labels.join(', ')}.`,
    'report_not_ready',
    fieldErrors,
  );
}
