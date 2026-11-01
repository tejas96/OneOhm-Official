'use client';

import type { InvoiceDraft, TaxInvoice } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Figures = Pick<
  TaxInvoice | InvoiceDraft,
  | 'supply'
  | 'taxablePaise'
  | 'cgstPaise'
  | 'sgstPaise'
  | 'igstPaise'
  | 'totalPaise'
  | 'scheduleTotalPaise'
  | 'differencePaise'
>;

function Row({
  label,
  value,
  strong,
  plain,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
  /** Words, not money: body text instead of the figures face. */
  readonly plain?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="type-body-sm text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'text-right text-ink',
          plain ? 'type-body-sm' : 'font-mono text-[0.875rem] tabular-nums',
          strong && 'font-medium',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Taxable value, the GST split and the total, as the invoice prints them. */
export function InvoiceFigures({
  figures,
  placeOfSupply,
}: {
  readonly figures: Figures;
  readonly placeOfSupply: string | null;
}) {
  const t = useTranslations('finance.billing.invoice');
  const supplyT = useTranslations('finance.billing.supply');
  return (
    <dl className="flex flex-col divide-y divide-hairline">
      {placeOfSupply && <Row label={t('placeOfSupply')} value={placeOfSupply} plain />}
      {figures.supply && <Row label={t('tax')} value={supplyT(figures.supply)} plain />}
      <Row label={t('taxable')} value={formatInr(figures.taxablePaise)} />
      {figures.supply === 'inter_state' ? (
        <Row label={t('igst')} value={formatInr(figures.igstPaise)} />
      ) : (
        <>
          <Row label={t('cgst')} value={formatInr(figures.cgstPaise)} />
          <Row label={t('sgst')} value={formatInr(figures.sgstPaise)} />
        </>
      )}
      <Row label={t('total')} value={formatInr(figures.totalPaise)} strong />
    </dl>
  );
}

/**
 * The ledger books revenue and GST from the payment schedule. When the invoice and the
 * schedule disagree, finance sees the gap here; nothing is posted for it.
 */
export function ScheduleDifference({ figures }: { readonly figures: Figures }) {
  const t = useTranslations('finance.billing.invoice');
  if (figures.differencePaise === 0) return null;
  const values = {
    schedule: formatInr(figures.scheduleTotalPaise),
    amount: formatInr(Math.abs(figures.differencePaise)),
  };
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-at-risk"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {figures.differencePaise > 0 ? t('scheduleLess', values) : t('scheduleMore', values)}
    </p>
  );
}
