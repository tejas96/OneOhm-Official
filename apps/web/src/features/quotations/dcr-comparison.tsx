'use client';

import type { QuotationPreview, QuotationTotals } from '@oneohm/api-contracts';
import { Badge, cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Kind = 'dcr' | 'nonDcr';

/**
 * The same system with DCR and with non-DCR panels, side by side (PRD 3.5 step 4), so
 * the customer decides in seconds. The chosen side is marked; the other is one tap away.
 */
export function DcrComparison({
  comparison,
  chosen,
  onChoose,
}: {
  readonly comparison: NonNullable<QuotationPreview['comparison']>;
  readonly chosen: Kind;
  /** Switch the quotation to the other kind of panel; omitted on read-only screens. */
  readonly onChoose?: (kind: Kind) => void;
}) {
  const t = useTranslations('quotations.compare');
  const cheaper: Kind =
    comparison.dcr.effectivePaise <= comparison.nonDcr.effectivePaise ? 'dcr' : 'nonDcr';
  return (
    <section aria-label={t('title')} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-title-md text-ink">{t('title')}</h3>
        <p className="type-body-sm text-ink-faint">{t('subtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['dcr', 'nonDcr'] as const).map((kind) => (
          <Side
            key={kind}
            kind={kind}
            totals={comparison[kind]}
            chosen={chosen === kind}
            cheaper={cheaper === kind}
            {...(onChoose ? { onChoose: () => onChoose(kind) } : {})}
          />
        ))}
      </div>
    </section>
  );
}

function Side({
  kind,
  totals,
  chosen,
  cheaper,
  onChoose,
}: {
  readonly kind: Kind;
  readonly totals: QuotationTotals;
  readonly chosen: boolean;
  readonly cheaper: boolean;
  readonly onChoose?: () => void;
}) {
  const t = useTranslations('quotations.compare');
  const reasonT = useTranslations('quotations.ineligible');
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="type-label font-medium text-ink">{t(kind)}</span>
        {chosen ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-accent text-on-accent">
            <Check aria-hidden className="size-3" />
          </span>
        ) : (
          cheaper && <Badge variant="energy">{t('lower')}</Badge>
        )}
      </span>
      <dl className="flex flex-col gap-1.5 type-body-sm">
        <Figure label={t('price')} value={formatInr(totals.totalPaise)} />
        <Figure
          label={t('subsidy')}
          value={totals.subsidyPaise > 0 ? `− ${formatInr(totals.subsidyPaise)}` : formatInr(0)}
        />
      </dl>
      <span className="flex flex-col gap-0.5 border-t border-hairline pt-2">
        <span className="type-label text-ink-faint">{t('effective')}</span>
        <span className="type-title-lg text-ink tabular-nums">
          {formatInr(totals.effectivePaise)}
        </span>
      </span>
      {totals.subsidyIneligible && (
        <span className="type-label text-ink-faint">{reasonT(totals.subsidyIneligible)}</span>
      )}
    </>
  );
  const classes = cn(
    'flex flex-col gap-3 rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color]',
    chosen
      ? 'border-accent bg-accent-soft/40 shadow-e1'
      : 'border-hairline bg-raised hover:border-rule',
  );
  if (!onChoose || chosen) {
    return <div className={classes}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-label={t('switchTo', { kind: t(kind) })}
      className={cn(classes, 'cursor-pointer')}
    >
      {body}
    </button>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  );
}
