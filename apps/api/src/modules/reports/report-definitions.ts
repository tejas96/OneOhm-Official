import { type ReportCompanyField, reportRequirements } from '@oneohm/domain';
import { assetText } from './report-assets';
import { conditionVariables, templateVariables } from './report-handlebars';

/**
 * A statutory report as one DISCOM prints it (PRD 3.18). The template body lives in
 * Settings → DISCOMs; what it needs is read from the body itself, so every printed field
 * is checked before a PDF is made and none prints blank. When it becomes ready is set by
 * the tasks that name it (Settings → Task templates); none means at project set-up.
 */
export interface ReportDefinition {
  /** The stored format's id; empty for OneOhm's bundled originals. */
  readonly id: string;
  readonly discomId: string;
  readonly key: string;
  readonly name: string;
  /** The Handlebars source that prints. */
  readonly body: string;
  /** Project facts the template prints. */
  readonly required: readonly string[];
  /** Company profile details the template prints (vendor, signatory). */
  readonly company?: readonly ReportCompanyField[];
  readonly onlyWithSubsidy?: boolean;
  /** Visible to the customer in their app once generated. */
  readonly customerVisible: boolean;
  /** Changes whenever the stored format changes, for the compiled-template cache. */
  readonly version: string;
}

/** OneOhm's own report formats, bundled with the API, that every DISCOM starts from. */
export interface BuiltInReport {
  readonly key: string;
  readonly name: string;
  readonly onlyWithSubsidy: boolean;
  readonly customerVisible: boolean;
  /** Only DISCOMs with these codes get it; every DISCOM when left out. */
  readonly discomCodes?: readonly string[];
}

const MSEDCL = ['MSEDCL'];

export const BUILT_IN_REPORTS: readonly BuiltInReport[] = [
  {
    key: 'model-agreement',
    name: 'Model Agreement',
    onlyWithSubsidy: false,
    customerVisible: true,
  },
  {
    key: 'net-metering-agreement',
    name: 'Net Metering Agreement',
    onlyWithSubsidy: false,
    customerVisible: true,
    discomCodes: MSEDCL,
  },
  { key: 'wcr', name: 'Work Completion Report', onlyWithSubsidy: false, customerVisible: true },
  { key: 'dcr', name: 'DCR Undertaking', onlyWithSubsidy: true, customerVisible: false },
  {
    key: 'annexure-proforma-a',
    name: 'Annexure-I & Proforma-A',
    onlyWithSubsidy: false,
    customerVisible: true,
    discomCodes: MSEDCL,
  },
  {
    key: 'meter-test-letter',
    name: 'Meter Test Covering Letter',
    onlyWithSubsidy: false,
    customerVisible: false,
    discomCodes: MSEDCL,
  },
];

/** OneOhm's bundled template for a key, or null for a report the owner added. */
export function builtInTemplate(key: string): string | null {
  return BUILT_IN_REPORTS.some((report) => report.key === key)
    ? assetText('reports', 'templates', `${key}.hbs`)
    : null;
}

const needs = new Map<string, ReturnType<typeof reportRequirements>>();

/** What a body needs; read once per body. */
export function requirementsOf(body: string) {
  let found = needs.get(body);
  if (!found) {
    found = reportRequirements(templateVariables(body), conditionVariables(body));
    needs.set(body, found);
  }
  return found;
}

/** A definition from a stored (or bundled) format. */
export function definitionOf(format: {
  readonly id: string;
  readonly discomId: string;
  readonly key: string;
  readonly name: string;
  readonly body: string;
  readonly onlyWithSubsidy: boolean;
  readonly customerVisible: boolean;
  readonly version: string;
}): ReportDefinition {
  const found = requirementsOf(format.body);
  return { ...format, required: found.facts, company: found.company };
}

/** The bundled originals as definitions (tests, and the defaults' own checks). */
export const builtInDefinitions = (): ReportDefinition[] =>
  BUILT_IN_REPORTS.map((report) =>
    definitionOf({
      ...report,
      id: '',
      discomId: '',
      body: builtInTemplate(report.key) ?? '',
      version: 'built-in',
    }),
  );

export const COMPANY_FIELD_LABELS: Readonly<Record<ReportCompanyField, string>> = {
  legalName: 'Company legal name (Settings → Company)',
  fullAddress: 'Company address (Settings → Company)',
  signatoryName: 'Signatory name (Settings → Company)',
  signatoryDesignation: 'Signatory designation (Settings → Company)',
  signatoryPhone: 'Signatory phone (Settings → Company)',
  signatoryEmail: 'Signatory email (Settings → Company)',
};
