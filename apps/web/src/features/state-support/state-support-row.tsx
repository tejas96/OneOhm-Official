'use client';

import type { QuotationTotals } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { HandHeart } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Reasons worth saying: the household is low-income but this system does not qualify. */
const SHOWN_REASONS = new Set(['not_residential', 'other_state', 'no_central_subsidy']);

/** True when the price stack should carry the state support line at all. */
export function showsStateSupport(totals: QuotationTotals): boolean {
  if ((totals.stateSupportPaise ?? 0) > 0) return true;
  return SHOWN_REASONS.has(totals.stateSupportIneligible ?? '');
}

/**
 * "Expected state support", its own line under the central subsidy (PRD 3.5). Like the
 * subsidy it is paid by the government; OneOhm invoices the full price.
 */
export function StateSupportRow({ totals }: { readonly totals: QuotationTotals }) {
  const t = useTranslations('stateSupport.price');
  if (!showsStateSupport(totals)) return null;
  const amount = totals.stateSupportPaise ?? 0;
  const reason = totals.stateSupportIneligible;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="inline-flex items-center gap-2 type-body text-on-panel">
          <HandHeart aria-hidden className="size-4" />
          {t('label')}
        </dt>
        <p className="type-body-sm text-on-panel-muted">
          {reason && amount === 0 ? t(`reasons.${reason}` as 'reasons.other_state') : t('hint')}
        </p>
      </div>
      <dd
        className={cn(
          'shrink-0 text-right type-display-md tabular-nums',
          amount > 0 ? 'text-on-panel' : 'text-on-panel-muted',
        )}
      >
        {amount > 0 ? `− ${formatInr(amount)}` : formatInr(0)}
      </dd>
    </div>
  );
}
