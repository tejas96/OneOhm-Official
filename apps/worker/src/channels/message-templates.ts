import { localValues } from '@oneohm/database';
import { DEFAULT_MESSAGE_TEMPLATES, templateExtras } from '@oneohm/domain';
import type { TemplateButton, TemplateHeader } from './whatsapp-cloud';

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

/** " · sent in Marathi" when the Marathi or Hindi template went out; empty for English. */
export function sentInTag(names: TemplateNames, customerLanguage: string | undefined): string {
  const chosen = templateFor(names, customerLanguage);
  if (!chosen.local) return '';
  return chosen.language === 'mr' ? ' · sent in Marathi' : ' · sent in Hindi';
}

/** A payload value the message needs; fails when it is missing. */
function required(key: string, field: string, values: Readonly<Record<string, unknown>>): string {
  return templateParameters(key, [field], values)[0] as string;
}

/**
 * The file and buttons for the Meta version that has them. Quick replies take positions
 * 0, 1… in order; the URL button comes after them. The optional quick replies (a newer version of
 * payment_reminder / payment_link) count only while `quickRepliesApproved` is on; the older shape
 * (the link at position 0) keeps going until then. A required button without its payload fails
 * early and clearly; an optional one without it (a message queued before it existed) is left out
 * and the link button keeps its place.
 */
export function templateExtraParts(
  key: string,
  values: Readonly<Record<string, unknown>>,
  quickRepliesApproved = false,
): { readonly header?: TemplateHeader; readonly buttons?: TemplateButton[] } {
  const extras = templateExtras(key);
  if (!extras) return {};
  const requiredReplies = extras.quickReplies ?? [];
  const optional = quickRepliesApproved ? (extras.optionalQuickReplies ?? []) : [];
  const buttons: TemplateButton[] = [
    ...requiredReplies.map((field, index) => ({
      kind: 'quick_reply' as const,
      index,
      payload: required(key, field, values),
    })),
    ...optional.flatMap((field, at) =>
      String(values[field] ?? '').trim()
        ? [
            {
              kind: 'quick_reply' as const,
              index: requiredReplies.length + at,
              payload: String(values[field]),
            },
          ]
        : [],
    ),
  ];
  if (extras.urlButton)
    buttons.push({
      kind: 'url',
      index: requiredReplies.length + optional.length,
      suffix: required(key, extras.urlButton, values),
    });
  return {
    ...(extras.document && {
      header: {
        kind: 'document',
        link: required(key, extras.document.urlField, values),
        filename: required(key, extras.document.nameField, values),
      },
    }),
    ...(buttons.length > 0 && { buttons }),
  };
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
  extrasApproved = false,
  quickRepliesApproved = false,
): {
  readonly name: string;
  readonly language: string;
  readonly parameters: string[];
  readonly header?: TemplateHeader;
  readonly buttons?: TemplateButton[];
} {
  const payload = (stored ?? {}) as Record<string, string>;
  const chosen = templateFor(names, payload.language);
  const values = chosen.local ? localValues(payload.language, key, payload) : payload;
  return {
    name: chosen.name,
    language: chosen.language,
    parameters: templateParameters(key, fields, values),
    ...(extrasApproved && templateExtraParts(key, values, quickRepliesApproved)),
  };
}
