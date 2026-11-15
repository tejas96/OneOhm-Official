import { MARKETING_TEMPLATE_KEYS } from '@oneohm/domain';

/** The messages shown in Settings: marketing messages live in Marketing → Connections. */
export function withoutMarketing<T extends { readonly key: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !MARKETING_TEMPLATE_KEYS.includes(row.key));
}
