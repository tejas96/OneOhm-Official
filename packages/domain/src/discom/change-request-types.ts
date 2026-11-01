import {
  type ChangeRequestField,
  type ChangeRequestFieldChoice,
  changeRequestField,
} from './change-request-catalog';

/**
 * The change requests OneOhm itself suggests when a site's details do not match (PRD
 * 3.15 step 2). Every DISCOM starts with these; owners add their own in Settings.
 */
export const CHANGE_REQUEST_TYPES = [
  'consumer_name_change',
  'name_spelling_correction',
  'property_type_change',
  'load_change',
  'new_ev_meter',
  'new_connection',
] as const;
export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];

/** A type's key: lower case words joined by underscores. */
export const CHANGE_REQUEST_KEY_PATTERN = /^[a-z][a-z0-9_]{1,59}$/;

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
  fields: readonly ChangeRequestFieldChoice[],
  input: Readonly<Record<string, string>>,
): { readonly values: Record<string, string>; readonly errors: Record<string, string> } {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const field of fields.map(changeRequestField)) {
    const raw = (input[field.key] ?? '').trim();
    const problem = raw ? fieldProblem(field, raw) : field.required ? 'This is required.' : null;
    if (problem) errors[field.key] = problem;
    else if (raw) values[field.key] = raw;
  }
  return { values, errors };
}

/** The required papers not yet on file, in the order the type lists them. */
export function missingChangeRequestDocuments(
  required: readonly string[],
  onFile: Iterable<string>,
): string[] {
  const have = new Set(onFile);
  return required.filter((category) => !have.has(category));
}
