'use client';

import type { QuotationDetail } from '@oneohm/api-contracts';
import { Badge } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { useTranslations } from 'next-intl';

/**
 * What the owner confirms before creating the project (PRD 3.8): its type, size and
 * subsidy, read from the accepted quotation.
 */
export function ProjectFactsSummary({ quotation }: { readonly quotation: QuotationDetail }) {
  const t = useTranslations('projectTeam.create');
  const subsidy = quotation.subsidyPaise > 0;
  return (
    <section
      aria-label={t('summary')}
      className="flex flex-col gap-2 rounded-xl border border-hairline bg-sunken/50 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="soft">{t(`type.${quotation.input.subsidyCategory}`)}</Badge>
        <Badge variant="soft">
          <span className="font-mono tabular-nums">{formatKwp(quotation.capacityWp)}</span>
        </Badge>
        <Badge variant="soft">
          {subsidy ? t('subsidy', { amount: formatInr(quotation.subsidyPaise) }) : t('noSubsidy')}
        </Badge>
      </div>
      <p className="type-body-sm text-ink-faint">{t('subsidyHint')}</p>
    </section>
  );
}
