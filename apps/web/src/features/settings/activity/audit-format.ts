import type { AuditEntry } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';

type Data = AuditEntry['data'];

/** "quotation.discount_approved" → "Quotation discount approved". */
export function readableAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "flagDistanceM" → "Flag distance m"; "discountPaise" → "Discount". */
export function readableKey(key: string): string {
  const base = key.endsWith('Paise') ? key.slice(0, -'Paise'.length) : key;
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.]/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSimple(value: unknown): boolean {
  return value !== null && value !== undefined && typeof value !== 'object';
}

/** One value as text; money keys (ending in `Paise`) show as rupees. */
export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (key.endsWith('Paise') && typeof value === 'number') return formatInr(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/** The one-line summary the table shows under the action. */
export function summarise(data: Data): string {
  if (!data) return '';
  return Object.entries(data)
    .filter(([, value]) => isSimple(value))
    .map(([key, value]) => `${key.replace(/Paise$/, '')}: ${formatValue(key, value)}`)
    .join(' · ');
}

export interface DetailRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Nested data, shown as a block instead of one line. */
  readonly block: boolean;
}

export interface ChangeRow {
  readonly key: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

export interface EntryView {
  readonly changes: readonly ChangeRow[];
  readonly details: readonly DetailRow[];
}

/**
 * Splits an entry's data into "before → after" rows and plain detail rows.
 * Only data that already carries both sides counts as a change: `before` with `after`,
 * or `from` with `to`. Everything else stays a plain detail.
 */
export function viewEntry(data: Data): EntryView {
  if (!data) return { changes: [], details: [] };
  const changes: ChangeRow[] = [];
  const used = new Set<string>();

  const { before, after } = data;
  if (isPlainObject(before) && isPlainObject(after)) {
    used.add('before').add('after');
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const from = formatValue(key, before[key]);
      const to = formatValue(key, after[key]);
      if (from !== to) changes.push({ key, label: readableKey(key), from, to });
    }
  }
  if ('from' in data && 'to' in data) {
    used.add('from').add('to');
    changes.push({
      key: 'from-to',
      label: readableKey('value'),
      from: formatValue('from', data.from),
      to: formatValue('to', data.to),
    });
  }

  const details = Object.entries(data)
    .filter(([key]) => !used.has(key))
    .map(([key, value]) => ({
      key,
      label: readableKey(key),
      value: formatValue(key, value),
      block: typeof value === 'object' && value !== null,
    }));
  return { changes, details };
}
