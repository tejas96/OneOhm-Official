'use client';

import type { DocumentRequirementRecord } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';
import { useFolderLabel } from '@/features/documents/gallery/use-labels';

const FLAG_WORDS = [
  ['loan', 'loan', 'noLoan'],
  ['subsidy', 'subsidy', 'noSubsidy'],
  ['nameChange', 'nameChange', 'noNameChange'],
] as const;

/** A yes/no rule as words; null when the rule does not care. */
const phrase = (value: boolean | undefined, yes: string, no: string) =>
  value === undefined ? null : value ? yes : no;

/** "Electricity bill folder · Loan projects · MSEDCL" for one paper's row. */
export function useRuleSummary() {
  const t = useTranslations('settings.requirements.rule');
  const typeT = useTranslations('commandCenter.filters.types');
  const folderLabel = useFolderLabel();
  return (item: DocumentRequirementRecord): string => {
    const rule = item.conditions;
    const when = [
      rule.types?.length ? rule.types.map((type) => typeT(type)).join(', ') : null,
      ...FLAG_WORDS.map(([flag, yes, no]) => phrase(rule[flag], t(yes), t(no))),
      rule.discomCodes?.length ? rule.discomCodes.join(', ') : null,
    ].filter((part): part is string => Boolean(part));
    return [
      item.categories.map((category) => folderLabel(category)).join(', '),
      ...(when.length > 0 ? when : [t('always')]),
      ...(item.fromCustomer ? [t('fromCustomer')] : []),
    ].join(' · ');
  };
}
