'use client';

import type { QuotationTotals } from '@oneohm/api-contracts';
import { cn, useCountUp } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { Landmark, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The quotation's hero, in the order the PRD fixes for the customer: total project
 * price, then the expected government subsidy, then the effective cost.
 */
export function PriceStack({
  totals,
  updating = false,
  children,
  className,
}: {
  readonly totals: QuotationTotals;
  /** A newer price is being calculated; the figures shown are the previous ones. */
  readonly updating?: boolean;
  /** Extra notes under the stack (discount approval, errors). */
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  const t = useTranslations('quotations.price');
  const reasonT = useTranslations('quotations.ineligible');
  const effective = useCountUp(totals.effectivePaise);
  return (
    <section
      aria-label={t('label')}
      aria-busy={updating || undefined}
      className={cn('oh-panel flex flex-col gap-6 rounded-[28px] p-6 shadow-e3 sm:p-7', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="type-overline text-on-panel-muted uppercase">{t('label')}</p>
        <p className="flex items-center gap-2 font-mono text-[0.75rem] text-on-panel-muted">
          {updating && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          {formatKwp(totals.capacityWp)} · {t('modules', { count: totals.moduleCount })}
        </p>
      </div>

      <dl className="flex flex-col gap-4">
        <Row label={t('total')} hint={t('totalHint')}>
          <span className="type-display-md text-on-panel tabular-nums">
            {formatInr(totals.totalPaise)}
          </span>
        </Row>
        <Row
          label={
            <span className="inline-flex items-center gap-2">
              <Landmark aria-hidden className="size-4" />
              {t('subsidy')}
            </span>
          }
          hint={totals.subsidyIneligible ? reasonT(totals.subsidyIneligible) : t('subsidyHint')}
        >
          <span
            className={cn(
              'type-display-md tabular-nums',
              totals.subsidyPaise > 0 ? 'text-on-panel' : 'text-on-panel-muted',
            )}
          >
            {totals.subsidyPaise > 0 ? `− ${formatInr(totals.subsidyPaise)}` : formatInr(0)}
          </span>
        </Row>
      </dl>

      <div className="flex flex-col gap-2 border-t border-on-panel/15 pt-5">
        <p className="type-overline text-on-panel-muted uppercase">{t('effective')}</p>
        <p className="type-hero text-on-panel tabular-nums">
          {formatInr(Math.round(effective / 100) * 100)}
        </p>
        <span aria-hidden className="oh-brand-line-x h-1 w-24 rounded-full" />
      </div>

      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  readonly label: ReactNode;
  readonly hint: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="type-body text-on-panel">{label}</dt>
        <p className="type-body-sm text-on-panel-muted">{hint}</p>
      </div>
      <dd className="shrink-0 text-right">{children}</dd>
    </div>
  );
}
