/**
 * Business-initiated WhatsApp messages must use templates approved in Meta's
 * WhatsApp Manager. Each OneOhm message key maps to a template of the same name and
 * the order of its {{1}}, {{2}}… body parameters. Create these in WhatsApp Manager
 * before switching WHATSAPP_DELIVERY to live.
 */
export const MESSAGE_TEMPLATES = {
  quotation_sent: ['customer', 'number', 'total', 'subsidy', 'effective'],
  project_started: ['customer', 'project', 'capacity'],
  project_milestone: ['customer', 'project', 'milestone'],
  payment_received: ['customer', 'amount', 'milestone', 'project'],
  payment_reminder: ['customer', 'amount', 'milestone', 'project'],
  staff_daily_digest: ['name', 'overdue', 'today', 'followUps'],
  service_update: ['customer', 'topic', 'status'],
} as const satisfies Record<string, readonly string[]>;

export type MessageKey = keyof typeof MESSAGE_TEMPLATES;

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(MESSAGE_TEMPLATES, value);
}

/** Body parameters in template order; fails when a required value is missing. */
export function templateParameters(
  key: MessageKey,
  payload: Readonly<Record<string, unknown>>,
): string[] {
  return MESSAGE_TEMPLATES[key].map((field) => {
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
