import type { EpcStage, WaitingParty } from '../epc/stages';
import { SUBSIDY_CATEGORIES } from '../subsidy/subsidy-rules';

/** Utility change requests (PRD 3.15, MSEDCL today). */
export const CHANGE_REQUEST_TYPES = [
  'consumer_name_change',
  'name_spelling_correction',
  'property_type_change',
  'load_change',
  'new_ev_meter',
  'new_connection',
] as const;
export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];

export type ChangeRequestField =
  | { readonly key: string; readonly kind: 'text'; readonly required: boolean }
  | { readonly key: string; readonly kind: 'kw'; readonly required: boolean }
  | {
      readonly key: string;
      readonly kind: 'select';
      readonly options: readonly string[];
      readonly required: boolean;
    };

export interface ChangeRequestStep {
  readonly key: string;
  readonly title: string;
  readonly roleKey: string;
  readonly durationDays: number;
  readonly waitingParty: WaitingParty;
  /** Details this step records, e.g. the DISCOM application number. */
  readonly captures: readonly string[];
}

export interface ChangeRequestDefinition {
  readonly type: ChangeRequestType;
  readonly title: string;
  readonly fields: readonly ChangeRequestField[];
  readonly steps: readonly ChangeRequestStep[];
  /** Project work that must wait until this request is done (only what truly depends). */
  readonly blocks: { readonly stages: readonly EpcStage[]; readonly taskKeys: readonly string[] };
}

const PHASES = ['single', 'three'] as const;

const step = (
  key: string,
  title: string,
  durationDays: number,
  waitingParty: WaitingParty,
  captures: readonly string[] = [],
): ChangeRequestStep => ({
  key,
  title,
  roleKey: 'liaisoning',
  durationDays,
  waitingParty,
  captures,
});

const collect = step('collect_documents', 'Collect documents from the customer', 3, 'customer');
const apply = step(
  'submit_application',
  'Submit the application on the DISCOM portal',
  2,
  'internal',
  ['application_number'],
);

export const CHANGE_REQUEST_DEFINITIONS: Readonly<
  Record<ChangeRequestType, ChangeRequestDefinition>
> = {
  consumer_name_change: {
    type: 'consumer_name_change',
    title: 'Consumer name change',
    fields: [{ key: 'newName', kind: 'text', required: true }],
    steps: [
      collect,
      apply,
      step('discom_approval', 'DISCOM approves the new consumer name', 15, 'discom'),
    ],
    blocks: { stages: ['net_metering', 'subsidy'], taskKeys: [] },
  },
  name_spelling_correction: {
    type: 'name_spelling_correction',
    title: 'Name spelling correction',
    fields: [{ key: 'correctedName', kind: 'text', required: true }],
    steps: [apply, step('discom_approval', 'DISCOM corrects the consumer name', 7, 'discom')],
    blocks: { stages: ['net_metering', 'subsidy'], taskKeys: [] },
  },
  property_type_change: {
    type: 'property_type_change',
    title: 'Property type change',
    fields: [{ key: 'newCategory', kind: 'select', options: SUBSIDY_CATEGORIES, required: true }],
    steps: [
      collect,
      apply,
      step('discom_approval', 'DISCOM changes the connection category', 15, 'discom'),
    ],
    blocks: { stages: ['subsidy'], taskKeys: [] },
  },
  load_change: {
    type: 'load_change',
    title: 'Load change',
    fields: [
      { key: 'phase', kind: 'select', options: PHASES, required: true },
      { key: 'newLoadKw', kind: 'kw', required: true },
    ],
    steps: [
      collect,
      apply,
      step('discom_inspection', 'DISCOM site inspection', 7, 'discom'),
      step('load_sanctioned', 'DISCOM sanctions the new load', 7, 'discom'),
    ],
    blocks: { stages: [], taskKeys: ['discom_application'] },
  },
  new_ev_meter: {
    type: 'new_ev_meter',
    title: 'New EV meter',
    fields: [{ key: 'note', kind: 'text', required: false }],
    steps: [
      apply,
      step('discom_inspection', 'DISCOM site inspection', 7, 'discom'),
      step('meter_installed', 'EV meter installed', 7, 'discom', ['ev_meter_number']),
    ],
    blocks: { stages: [], taskKeys: [] },
  },
  new_connection: {
    type: 'new_connection',
    title: 'New connection',
    fields: [
      { key: 'phase', kind: 'select', options: PHASES, required: true },
      { key: 'note', kind: 'text', required: false },
    ],
    steps: [
      collect,
      apply,
      step('discom_inspection', 'DISCOM site inspection', 7, 'discom'),
      step('connection_released', 'DISCOM releases the connection', 10, 'discom', [
        'consumer_number',
      ]),
    ],
    blocks: { stages: ['commissioning', 'net_metering'], taskKeys: [] },
  },
};

export function isChangeRequestType(value: string): value is ChangeRequestType {
  return (CHANGE_REQUEST_TYPES as readonly string[]).includes(value);
}

/** A message when a filled-in value is not acceptable for its field, else null. */
function fieldProblem(field: ChangeRequestField, raw: string): string | null {
  if (field.kind === 'kw') {
    const kw = Number(raw);
    return Number.isFinite(kw) && kw > 0 && kw <= 10_000
      ? null
      : 'Enter the load in kW, for example 5 or 7.5.';
  }
  if (field.kind === 'select')
    return field.options.includes(raw) ? null : 'Pick one of the options.';
  return field.required && raw.length < 2 ? 'Use at least 2 characters.' : null;
}

/** Checks the request's own fields; returns the cleaned values or a message per field. */
export function validateChangeRequestValues(
  type: ChangeRequestType,
  input: Readonly<Record<string, string>>,
): { readonly values: Record<string, string>; readonly errors: Record<string, string> } {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const field of CHANGE_REQUEST_DEFINITIONS[type].fields) {
    const raw = (input[field.key] ?? '').trim();
    const problem = raw ? fieldProblem(field, raw) : field.required ? 'This is required.' : null;
    if (problem) errors[field.key] = problem;
    else if (raw) values[field.key] = raw;
  }
  return { values, errors };
}
