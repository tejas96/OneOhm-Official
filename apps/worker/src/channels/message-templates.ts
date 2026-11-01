import { localValues } from '@oneohm/database';
import { DEFAULT_MESSAGE_TEMPLATES } from '@oneohm/domain';

/**
 * The default field order per message key. Settings can change it (and the Meta name and
 * language) in the message_templates table; these are used when no row exists.
 */
export const MESSAGE_TEMPLATES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  DEFAULT_MESSAGE_TEMPLATES.map((template) => [template.key, template.fields]),
);

/** Body parameters in template order; fails when a required value is missing. */
export function templateParameters(
  key: string,
  fields: readonly string[],
  payload: Readonly<Record<string, unknown>>,
): string[] {
  return fields.map((field) => {
    const value = payload[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new MissingFieldError(key, field);
    }
    return String(value);
  });
}

export class MissingFieldError extends Error {
  constructor(
    readonly key: string,
    readonly field: string,
  ) {
    super(`Message "${key}" is missing "${field}".`);
  }
}

interface TemplateNames {
  readonly metaName: string;
  readonly language: string;
  readonly metaNameMr?: string | null;
  readonly metaNameHi?: string | null;
}

/**
 * The approved template to send in the customer's language (PRD 6.2): the Marathi or
 * Hindi one when the owner has set it up, otherwise the English one.
 */
export function templateFor(
  names: TemplateNames,
  customerLanguage: string | undefined,
): { readonly name: string; readonly language: string; readonly local: boolean } {
  if (customerLanguage === 'mr-IN' && names.metaNameMr)
    return { name: names.metaNameMr, language: 'mr', local: true };
  if (customerLanguage === 'hi-IN' && names.metaNameHi)
    return { name: names.metaNameHi, language: 'hi', local: true };
  return { name: names.metaName, language: names.language, local: false };
}

/**
 * The approved template and its values for one queued message. The customer's language
 * rides in the payload; a Marathi or Hindi template, when set up, gets the step and
 * payment names in that language too.
 */
export function approvedMessage(
  key: string,
  fields: readonly string[],
  names: TemplateNames,
  stored: unknown,
): { readonly name: string; readonly language: string; readonly parameters: string[] } {
  const payload = (stored ?? {}) as Record<string, string>;
  const chosen = templateFor(names, payload.language);
  const values = chosen.local ? localValues(payload.language, key, payload) : payload;
  return {
    name: chosen.name,
    language: chosen.language,
    parameters: templateParameters(key, fields, values),
  };
}
