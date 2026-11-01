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
