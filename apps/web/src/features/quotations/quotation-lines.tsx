'use client';

import type { QuotationPreview, QuotationTotals } from '@oneohm/api-contracts';
import { Badge, cn } from '@oneohm/design-system/web';
import { LINE_CATEGORIES } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';

type Line = QuotationPreview['lines'][number];

const ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem]';

/**
 * The bill of materials grouped by kind, then the arithmetic from subtotal to total, so
 * anyone can see exactly how the price was reached (PRD 3.9). Cost and margin only for
 * people who approve discounts.
 */
export function QuotationLines({
  lines,
  totals,
  showMargin = false,
}: {
  readonly lines: readonly Line[];
  readonly totals: QuotationTotals;
  readonly showMargin?: boolean;
}) {
  const t = useTranslations('quotations.lines');
  const categoryT = useTranslations('quotations.categories');
  const groups = LINE_CATEGORIES.map((category) => ({
    category,
    lines: lines.filter((line) => line.category === category),
  })).filter((group) => group.lines.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className={cn(ROW, 'hidden border-b border-hairline pb-2 md:grid')} aria-hidden>
        <span className="type-overline text-ink-faint uppercase">{t('item')}</span>
        <span className="text-right type-overline text-ink-faint uppercase">{t('quantity')}</span>
        <span className="text-right type-overline text-ink-faint uppercase">{t('rate')}</span>
        <span className="text-right type-overline text-ink-faint uppercase">{t('amount')}</span>
      </div>
      {groups.map((group) => (
        <section key={group.category} aria-label={categoryT(group.category)}>
          <h4 className="mb-1 type-overline text-accent uppercase">{categoryT(group.category)}</h4>
          <ul className="flex flex-col divide-y divide-hairline">
            {group.lines.map((line) => (
              <LineRow key={line.key} line={line} />
            ))}
          </ul>
        </section>
      ))}
      <dl className="ml-auto flex w-full max-w-sm flex-col gap-2 border-t border-hairline pt-4 type-body-sm">
        <Sum label={t('subtotal')} value={totals.subtotalPaise} />
        {totals.contingencyPaise > 0 && (
          <Sum
            label={t('contingency')}
            value={totals.contingencyPaise}
            hint={t('contingencyHint')}
          />
        )}
        {totals.discountPaise > 0 && <Sum label={t('discount')} value={-totals.discountPaise} />}
        <Sum label={t('tax')} value={totals.taxPaise} />
        <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-2">
          <dt className="type-title-md text-ink">{t('total')}</dt>
          <dd className="type-title-lg text-ink tabular-nums">{formatInr(totals.totalPaise)}</dd>
        </div>
        {showMargin && (
          <>
            <Sum label={t('cost')} value={totals.costPaise} muted />
            <Sum label={t('margin')} value={totals.marginPaise} muted />
          </>
        )}
      </dl>
    </div>
  );
}

function LineRow({ line }: { readonly line: Line }) {
  const t = useTranslations('quotations.lines');
  const format = useFormatter();
  const quantity = format.number(line.quantity, { maximumFractionDigits: 2 });
  return (
    <li className={cn(ROW, 'items-baseline py-3')}>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="type-body text-ink">{line.description}</span>
        <span className="flex flex-wrap items-center gap-2 type-label text-ink-faint">
          <span className="md:hidden">
            {quantity} {line.unit} × {formatInr(line.unitPricePaise)}
          </span>
          {line.basis !== 'catalog' && (
            <Badge variant="soft" className="py-0">
              {t(`basis.${line.basis}`)}
            </Badge>
          )}
        </span>
      </span>
      <span className="hidden text-right type-body-sm text-ink-muted tabular-nums md:block">
        {quantity} {line.unit}
      </span>
      <span className="hidden text-right type-body-sm text-ink-muted tabular-nums md:block">
        {formatInr(line.unitPricePaise)}
      </span>
      <span className="text-right type-body text-ink tabular-nums">
        {formatInr(line.amountPaise)}
      </span>
    </li>
  );
}

function Sum({
  label,
  value,
  hint,
  muted = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
  readonly muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn('flex flex-col', muted ? 'text-ink-faint' : 'text-ink-muted')}>
        {label}
        {hint && <span className="type-label text-ink-faint">{hint}</span>}
      </dt>
      <dd className={cn('tabular-nums', muted ? 'text-ink-faint' : 'text-ink')}>
        {value < 0 ? `− ${formatInr(-value)}` : formatInr(value)}
      </dd>
    </div>
  );
}
