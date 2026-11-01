import { DOCUMENT_CATEGORIES } from '../documents/document-categories';
import { EPC_STAGES, WAITING_PARTIES } from '../epc/stages';
import {
  CHANGE_REQUEST_CAPTURES,
  CHANGE_REQUEST_INPUT_KEYS,
  CHANGE_REQUEST_UPDATE_KEYS,
  CHANGE_REQUEST_UPDATES,
  type ChangeRequestTypeConfig,
} from './change-request-catalog';

/** What else a type is checked against: the roles and project tasks that exist. */
export interface ChangeRequestTypeKnown {
  readonly roles: ReadonlySet<string>;
  readonly taskKeys: ReadonlySet<string>;
}

type Errors = Record<string, string>;

const has = (list: readonly string[], value: string) => list.includes(value);
const repeats = (list: readonly string[]) => new Set(list).size !== list.length;

function checkText(config: ChangeRequestTypeConfig, errors: Errors) {
  if (config.title.trim().length < 3) errors.title = 'Give the change a name of 3 letters or more.';
  else if (config.title.length > 80) errors.title = 'Keep the name under 80 letters.';
  if (config.description.length > 200) errors.description = 'Keep this to one short line.';
}

function checkFields(config: ChangeRequestTypeConfig, errors: Errors) {
  const keys = config.fields.map((field) => field.key);
  if (keys.some((key) => !has(CHANGE_REQUEST_INPUT_KEYS, key)))
    errors.fields = 'Pick the details from the list.';
  else if (repeats(keys)) errors.fields = 'A detail is asked for twice.';
  if (config.documents.some((category) => !has(DOCUMENT_CATEGORIES, category)))
    errors.documents = 'Pick the papers from the list.';
  else if (repeats(config.documents)) errors.documents = 'A paper is listed twice.';
}

function checkSteps(
  config: ChangeRequestTypeConfig,
  known: ChangeRequestTypeKnown,
  errors: Errors,
) {
  if (config.steps.length === 0) errors.steps = 'Add at least one step.';
  if (config.steps.length > 12) errors.steps = 'Keep it to 12 steps or fewer.';
  if (repeats(config.steps.map((step) => step.key))) errors.steps = 'Two steps share a key.';
  config.steps.forEach((step, index) => {
    const at = `steps.${index}`;
    if (step.title.trim().length < 3) errors[`${at}.title`] = 'Say what happens in this step.';
    else if (step.title.length > 120) errors[`${at}.title`] = 'Keep this under 120 letters.';
    if (!known.roles.has(step.roleKey)) errors[`${at}.roleKey`] = 'Pick a role from the list.';
    if (!Number.isInteger(step.durationDays) || step.durationDays < 0 || step.durationDays > 365)
      errors[`${at}.durationDays`] = 'Use whole days from 0 to 365.';
    if (!has(WAITING_PARTIES, step.waitingParty))
      errors[`${at}.waitingParty`] = 'Pick who the step waits on.';
    if (step.captures.some((capture) => !has(CHANGE_REQUEST_CAPTURES, capture)))
      errors[`${at}.captures`] = 'Pick the details from the list.';
  });
}

function checkImpact(
  config: ChangeRequestTypeConfig,
  known: ChangeRequestTypeKnown,
  errors: Errors,
) {
  if (config.blocks.stages.some((stage) => !has(EPC_STAGES, stage)))
    errors['blocks.stages'] = 'Pick the project stages from the list.';
  const unknownTasks = config.blocks.taskKeys.filter((key) => !known.taskKeys.has(key));
  if (unknownTasks.length > 0) errors['blocks.taskKeys'] = 'Pick the project tasks from the list.';
  if (config.updates.some((key) => !has(CHANGE_REQUEST_UPDATE_KEYS, key))) {
    errors.updates = 'Pick the site details from the list.';
    return;
  }
  if (repeats(config.updates)) errors.updates = 'A site detail is listed twice.';
  const inputs = new Set<string>(config.fields.map((field) => field.key));
  const captures = new Set<string>(config.steps.flatMap((step) => step.captures));
  const orphan = config.updates.find((key) => {
    const source = CHANGE_REQUEST_UPDATES[key];
    return (
      ![...source.inputs].some((input) => inputs.has(input)) &&
      ![...source.captures].some((capture) => captures.has(capture))
    );
  });
  if (orphan)
    errors.updates =
      'A site detail it updates is never filled in or recorded. Ask for it, or have a step record it.';
}

/**
 * Plain messages, by field, for anything wrong with a change-request type the owner
 * built; empty when it can be saved. Every site detail it updates must come from a
 * detail it asks for or one a step records, so completion never writes a blank.
 */
export function checkChangeRequestType(
  config: ChangeRequestTypeConfig,
  known: ChangeRequestTypeKnown,
): Errors {
  const errors: Errors = {};
  checkText(config, errors);
  checkFields(config, errors);
  checkSteps(config, known, errors);
  checkImpact(config, known, errors);
  return errors;
}
