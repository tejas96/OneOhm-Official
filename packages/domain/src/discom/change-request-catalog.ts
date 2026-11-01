import type { DocumentCategory } from '../documents/document-categories';
import type { EpcStage, WaitingParty } from '../epc/stages';
import { SUBSIDY_CATEGORIES } from '../subsidy/subsidy-rules';

/**
 * The building blocks a DISCOM's change-request types are made from (PRD 3.15: "types,
 * their input fields, required documents and task templates are configurable per
 * DISCOM"). Owners pick from these named lists in Settings → DISCOMs; nobody types a key.
 */

const PHASES = ['single', 'three'] as const;

/** What a person fills in when raising a request: the site and customer details it changes. */
export const CHANGE_REQUEST_INPUT_KEYS = [
  'newName',
  'correctedName',
  'newCategory',
  'phase',
  'newLoadKw',
  'note',
] as const;
export type ChangeRequestInputKey = (typeof CHANGE_REQUEST_INPUT_KEYS)[number];

export const CHANGE_REQUEST_INPUTS = {
  newName: { kind: 'text' },
  correctedName: { kind: 'text' },
  newCategory: { kind: 'select', options: SUBSIDY_CATEGORIES },
  phase: { kind: 'select', options: PHASES },
  newLoadKw: { kind: 'kw' },
  note: { kind: 'text' },
} as const satisfies Record<
  ChangeRequestInputKey,
  { readonly kind: 'text' | 'kw' | 'select'; readonly options?: readonly string[] }
>;

/** Details a step records when it is done, such as the number the DISCOM gives. */
export const CHANGE_REQUEST_CAPTURES = [
  'application_number',
  'consumer_number',
  'ev_meter_number',
] as const;
export type ChangeRequestCapture = (typeof CHANGE_REQUEST_CAPTURES)[number];

/** Site details a finished request can write (PRD 3.15 step 5). */
export const CHANGE_REQUEST_UPDATE_KEYS = [
  'meterHolderName',
  'subsidyCategory',
  'phase',
  'sanctionedLoadW',
  'consumerNumber',
  'evMeterNumber',
] as const;
export type ChangeRequestUpdateKey = (typeof CHANGE_REQUEST_UPDATE_KEYS)[number];

/** Where each site detail's new value comes from: the first of its sources the request has. */
export const CHANGE_REQUEST_UPDATES = {
  meterHolderName: { inputs: ['newName', 'correctedName'], captures: [] },
  subsidyCategory: { inputs: ['newCategory'], captures: [] },
  phase: { inputs: ['phase'], captures: [] },
  sanctionedLoadW: { inputs: ['newLoadKw'], captures: [] },
  consumerNumber: { inputs: [], captures: ['consumer_number'] },
  evMeterNumber: { inputs: [], captures: ['ev_meter_number'] },
} as const satisfies Record<
  ChangeRequestUpdateKey,
  {
    readonly inputs: readonly ChangeRequestInputKey[];
    readonly captures: readonly ChangeRequestCapture[];
  }
>;

export interface ChangeRequestFieldChoice {
  readonly key: ChangeRequestInputKey;
  readonly required: boolean;
}

/** A field as the raise form shows it. */
export type ChangeRequestField =
  | {
      readonly key: ChangeRequestInputKey;
      readonly kind: 'text' | 'kw';
      readonly required: boolean;
    }
  | {
      readonly key: ChangeRequestInputKey;
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
  readonly captures: readonly ChangeRequestCapture[];
}

export interface ChangeRequestBlocks {
  readonly stages: readonly EpcStage[];
  readonly taskKeys: readonly string[];
}

/** One DISCOM's change-request type, as stored. */
export interface ChangeRequestTypeConfig {
  readonly key: string;
  readonly title: string;
  /** What it does, in a line. */
  readonly description: string;
  readonly fields: readonly ChangeRequestFieldChoice[];
  /** Papers that must be on file for the customer or the site before it is raised. */
  readonly documents: readonly DocumentCategory[];
  readonly steps: readonly ChangeRequestStep[];
  /** Project work that must wait until this request is done (only what truly depends). */
  readonly blocks: ChangeRequestBlocks;
  /** Site details written when the last step is done. */
  readonly updates: readonly ChangeRequestUpdateKey[];
}

/** The form field for a chosen input: its kind and options come from the named list. */
export function changeRequestField(choice: ChangeRequestFieldChoice): ChangeRequestField {
  const input = CHANGE_REQUEST_INPUTS[choice.key];
  return input.kind === 'select'
    ? { key: choice.key, kind: 'select', options: input.options, required: choice.required }
    : { key: choice.key, kind: input.kind, required: choice.required };
}

/** A short key from a title, e.g. "Meter shifting" → "meter_shifting". */
export function keyFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return /^[a-z]/.test(slug) ? slug : `type_${slug}`;
}
