import { KNOWN_FACT_KEYS } from '../tasks/fact-fields';

/**
 * What a statutory report needs (PRD 3.18): every name its template prints, read from the
 * template itself, so no PDF ever prints an empty line. Names that are worked out from
 * other details (or from the company profile) need those instead.
 */
export type ReportCompanyField =
  | 'legalName'
  | 'fullAddress'
  | 'signatoryName'
  | 'signatoryDesignation'
  | 'signatoryPhone'
  | 'signatoryEmail';

interface Source {
  readonly facts?: readonly string[];
  readonly company?: readonly ReportCompanyField[];
}

/** Template names filled from something other than a fact of the same name. */
const DERIVED: Readonly<Record<string, Source>> = {
  // From the project itself: always known.
  site_category: {},
  re_source: {},
  re_arrangement_type: {},
  project_model: {},
  capacity_type: {},
  generated_on: {},
  // The project's start date unless the onboarding date was recorded (PRD 3.18).
  project_onboarded_date: {},
  // From other facts.
  re_installed_capacity_rooftop_kw: { facts: ['installed_capacity_kw'] },
  re_installed_capacity_ground_kw: { facts: ['installed_capacity_kw'] },
  re_installed_capacity_rooftop_ground_kw: { facts: ['installed_capacity_kw'] },
  inverter_make_model: { facts: ['inverter_make'] },
  earthing_details: { facts: ['earthing_resistance'] },
  // From Settings → Company.
  vendor_name: { company: ['legalName'] },
  vendor_address: { company: ['fullAddress'] },
  signatory_name: { company: ['signatoryName'] },
  signatory_designation: { company: ['signatoryDesignation'] },
  signatory_phone: { company: ['signatoryPhone'] },
  signatory_email: { company: ['signatoryEmail'] },
};

/** Names a template may print besides recorded facts: the signature images. */
const IMAGES = ['__signature', '__stamp'];

/**
 * The names a template prints that OneOhm does not know (PRD 3.18: an uploaded format is
 * refused rather than printing a field nobody records). Sorted, empty when all are known.
 */
export function unknownReportNames(variables: Iterable<string>): string[] {
  const known = new Set([...KNOWN_FACT_KEYS, ...Object.keys(DERIVED), ...IMAGES]);
  return [...new Set(variables)].filter((name) => !known.has(name)).sort();
}

export interface ReportRequirements {
  readonly facts: readonly string[];
  readonly company: readonly ReportCompanyField[];
}

/**
 * The facts and company details a template needs. A name the template prints only when
 * present (`{{#if x}}`) is optional by the template's own design.
 */
export function reportRequirements(
  variables: Iterable<string>,
  optional: ReadonlySet<string>,
): ReportRequirements {
  const facts = new Set<string>();
  const company = new Set<ReportCompanyField>();
  for (const name of variables) {
    if (optional.has(name) || name.startsWith('__')) continue;
    const derived = DERIVED[name];
    if (!derived) {
      facts.add(name);
      continue;
    }
    for (const fact of derived.facts ?? []) facts.add(fact);
    for (const field of derived.company ?? []) company.add(field);
  }
  return { facts: [...facts].sort(), company: [...company].sort() };
}

/** A project task as report triggers see it. */
export interface ReportTriggerTask {
  readonly templateKey: string | null;
  readonly title: string;
  readonly status: string;
  readonly reports: readonly string[];
  readonly completedAt: Date | null;
}

/**
 * The task a report still waits for (PRD 3.18 default triggers, set per task in
 * Settings → Task templates): null once any task naming the report is completed, or
 * when no task on the project names it.
 */
export function reportWaitsFor(
  key: string,
  tasks: readonly ReportTriggerTask[],
): ReportTriggerTask | null {
  const triggers = tasks.filter((task) => task.reports.includes(key));
  if (triggers.length === 0 || triggers.some((task) => task.status === 'completed')) return null;
  return triggers[0] ?? null;
}

/** Dates the reports print, taken from when the task that marks them was completed. */
export const TASK_DATE_FACTS: Readonly<Record<string, string>> = {
  installation_date: 'installation_complete',
  commissioning_date: 'testing_commissioning',
};

/** `YYYY-MM-DD` in India for a moment. */
const indiaDay = (moment: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(moment);

/** The installation and commissioning dates, once their tasks are done. */
export function taskDateFacts(tasks: readonly ReportTriggerTask[]): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const [fact, templateKey] of Object.entries(TASK_DATE_FACTS)) {
    const task = tasks.find((row) => row.templateKey === templateKey && row.completedAt);
    if (task?.completedAt) facts[fact] = indiaDay(task.completedAt);
  }
  return facts;
}
