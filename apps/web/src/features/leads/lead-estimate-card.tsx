'use client';

import type { LeadEstimate } from '@oneohm/api-contracts';
import { Button, Card } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { FileText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** The estimate the WhatsApp bot sent this lead, with a link to the PDF they received. */
export function LeadEstimateCard({ estimate }: { readonly estimate: LeadEstimate }) {
  const t = useTranslations('leads.estimate');
  const format = useFormatter();
  return (
    <Card className="flex flex-col gap-1 rounded-[28px] p-5">
      <h2 className="type-overline text-ink-faint uppercase">{t('title')}</h2>
      <p className="mb-2 type-body-sm text-ink-muted">{t('body')}</p>
      <dl className="flex flex-col divide-y divide-hairline">
        <Row label={t('size')}>{formatKwp(estimate.capacityWp)}</Row>
        <Row label={t('price')}>{formatInr(estimate.totalPaise)}</Row>
        <Row label={t('afterSubsidy')}>{formatInr(estimate.effectivePaise)}</Row>
        <Row label={t('saving')}>{formatInr(estimate.monthlySavingPaise)}</Row>
        <Row label={t('payback')}>
          {t('years', {
            years: format.number(estimate.paybackYears, { maximumFractionDigits: 1 }),
          })}
        </Row>
        <Row label={t('sentOn')}>
          {format.dateTime(new Date(estimate.createdAt), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Row>
      </dl>
      <Button
        asChild
        variant="secondary"
        size="sm"
        leadingIcon={<FileText />}
        className="mt-3 self-start"
      >
        <a href={`/api/v1${estimate.pdfUrl}?disposition=inline`} target="_blank" rel="noreferrer">
          {t('openPdf')}
        </a>
      </Button>
    </Card>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-2">
      <dt className="type-body-sm text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right type-body-sm text-ink">{children}</dd>
    </div>
  );
}
