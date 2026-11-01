import type { CommissionRule } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';

type Translate = (key: string, values?: Record<string, string>) => string;

/** "3% of project value, when the advance is paid" — one line for a rule. */
export function ruleSummary(
  t: Translate,
  rule: Pick<CommissionRule, 'active' | 'basis' | 'rateBp' | 'perKwPaise' | 'qualifyingEvent'>,
): string {
  if (!rule.active) return t('rule.off');
  const event = t(`rule.events.${rule.qualifyingEvent}`);
  return rule.basis === 'percent'
    ? t('rule.percent', { rate: percent(rule.rateBp), event })
    : t('rule.perKw', { amount: formatInr(rule.perKwPaise), event });
}

/** Basis points as a percent with no trailing zeros: 350 → "3.5". */
export function percent(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, '');
}
