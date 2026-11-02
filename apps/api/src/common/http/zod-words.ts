import { defaultErrorMap, type ZodIssue, ZodIssueCode } from 'zod';

/**
 * A field message people can act on. Messages written in the contracts are kept; zod's
 * own developer wording ("String must contain at least 1 character(s)") is replaced.
 */
export function plainIssue(issue: ZodIssue): string {
  const stock = defaultErrorMap(issue, { defaultError: issue.message, data: undefined }).message;
  if (issue.message !== stock) return issue.message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return wrongType(issue);
    case ZodIssueCode.too_small:
      return tooSmall(issue);
    case ZodIssueCode.too_big:
      return tooBig(issue);
    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
    case ZodIssueCode.invalid_literal:
      return 'Pick one of the options.';
    case ZodIssueCode.invalid_string:
      return badString(issue);
    case ZodIssueCode.invalid_date:
      return 'Enter a valid date.';
    case ZodIssueCode.not_multiple_of:
      return 'Check this amount.';
    default:
      return 'Check this value.';
  }
}

type IssueOf<C extends ZodIssue['code']> = Extract<ZodIssue, { code: C }>;

/** A missing value is required; a wrong one asks for a number or a check. */
function wrongType(issue: IssueOf<'invalid_type'>): string {
  if (issue.received === 'undefined' || issue.received === 'null') return 'This is required.';
  return issue.expected === 'number' || issue.expected === 'integer'
    ? 'Enter a number.'
    : 'Check this value.';
}

/** Too short, too few, too early or too low, by the kind of value. */
function tooSmall(issue: IssueOf<'too_small'>): string {
  const min = Number(issue.minimum);
  if (issue.type === 'string') {
    return min <= 1 ? 'This is required.' : `Use at least ${min} characters.`;
  }
  if (issue.type === 'array' || issue.type === 'set') {
    return min <= 1 ? 'Add at least one.' : `Add at least ${min}.`;
  }
  if (issue.type === 'date') return 'Pick a later date.';
  return issue.inclusive ? `Enter ${min} or more.` : `Enter more than ${min}.`;
}

/** Too long, too many, too late or too high, by the kind of value. */
function tooBig(issue: IssueOf<'too_big'>): string {
  const max = Number(issue.maximum);
  if (issue.type === 'string') return `Keep it to ${max} characters or fewer.`;
  if (issue.type === 'array' || issue.type === 'set') return `Add ${max} or fewer.`;
  if (issue.type === 'date') return 'Pick an earlier date.';
  return issue.inclusive ? `Enter ${max} or less.` : `Enter less than ${max}.`;
}

/** What a string check wanted, keyed by zod's validation name. */
const STRING_FORMAT: Readonly<Record<string, string>> = {
  email: 'Enter a valid email address.',
  uuid: 'Pick one from the list.',
  cuid: 'Pick one from the list.',
  url: 'Enter a full web address, starting with https://.',
  datetime: 'Enter a valid date.',
  date: 'Enter a valid date.',
};

/** A string in the wrong format; checks zod names by object (regex, includes…) read alike. */
function badString(issue: IssueOf<'invalid_string'>): string {
  const { validation } = issue;
  if (typeof validation !== 'string' || !Object.hasOwn(STRING_FORMAT, validation)) {
    return 'Check the format.';
  }
  return STRING_FORMAT[validation] ?? 'Check the format.';
}

/** "property.addressLine" → "Address line"; ids and units are dropped from the name. */
export function fieldLabel(path: string): string {
  const last =
    path
      .split('.')
      .filter((part) => !/^\d+$/.test(part))
      .pop() ?? path;
  const bare = last.replace(/(Id|Ids|Paise|Wp|E164)$/, '') || last;
  const words = bare.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The form's sentence: names the first field to fix, so it reads well even alone. */
export function validationSentence(fields: Readonly<Record<string, string>>): string {
  const keys = Object.keys(fields);
  const [first] = keys;
  if (!first || first === 'body') return 'Some details need fixing.';
  const more = keys.length > 1 ? ` (and ${keys.length - 1} more)` : '';
  return `Check ${fieldLabel(first)}: ${fields[first]}${more}`;
}
