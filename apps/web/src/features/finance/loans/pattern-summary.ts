'use client';

import type { LendingPartner } from '@oneohm/api-contracts';
import { patternFor } from '@oneohm/domain';
import { useFormatter, useTranslations } from 'next-intl';

/** A part's name mid-sentence: "First disbursement" reads "first …", "SBI release" stays. */
const midSentence = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;

/** Basis points as a percent for people: 7000 → "70%", 3333 → "33.33%". */
export function usePercent() {
  const format = useFormatter();
  return (bp: number) => format.number(bp / 10_000, { style: 'percent', maximumFractionDigits: 2 });
}

/** A lender's parts in a sentence: "70% first disbursement and 30% final disbursement". */
export function usePatternSummary() {
  const t = useTranslations('finance.loans.lendersDialog.parts');
  const format = useFormatter();
  const percent = usePercent();
  return (lender: Pick<LendingPartner, 'disbursement' | 'tranchePattern'>) =>
    format.list(
      patternFor(lender.disbursement, lender.tranchePattern).map((part) =>
        t('item', { share: percent(part.shareBp), label: midSentence(part.label) }),
      ),
      { type: 'conjunction' },
    );
}
