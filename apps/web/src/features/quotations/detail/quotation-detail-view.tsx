'use client';

import type { QuotationDetail } from '@oneohm/api-contracts';
import {
  Badge,
  PageHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
  StatusPill,
} from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageSquareX } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { SectionHeading } from '@/features/command-center/section-heading';
import { ChangeRequestNotice } from '@/features/discom/change-request-notice';
import { QuotationChangeNote } from '@/features/project-changes/quotation-change-note';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { PropertySummary } from '../builder/property-summary';
import { CostBuildup } from '../cost-buildup';
import { PriceStack } from '../price-stack';
import { QuotationLines } from '../quotation-lines';
import { STATUS_TONE } from '../quotation-status';
import { QuotationActions } from './quotation-actions';
import { SystemFacts } from './system-facts';

export function useQuotation(id: string) {
  return useQuery({
    queryKey: ['quotation', id],
    queryFn: () => expectStatus(api.quotations.getQuotation({ params: { id } }), 200),
  });
}

/** One quotation: the price stack, who and what it is for, the lines, and what comes next. */
export function QuotationDetailView({ id }: { readonly id: string }) {
  const t = useTranslations('quotations.detail');
  const query = useQuotation(id);
  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-24 w-1/2 rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-[28px]" />
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  return <Detail quotation={query.data} />;
}

function Detail({ quotation }: { readonly quotation: QuotationDetail }) {
  const t = useTranslations('quotations.detail');
  const statusT = useTranslations('quotations.status');
  const format = useFormatter();
  const showMargin = useCan('quotations.approve_discount');
  const date = (value: string) =>
    format.dateTime(new Date(value), { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-10 py-2">
      <PageHeader
        eyebrow={
          <Link href="/quotations" className="inline-flex items-center gap-1.5 hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            {t('back')}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            {quotation.customer.name}
            <span className="font-mono text-[1rem] text-ink-faint">
              {quotation.number}
              {quotation.revision > 1 ? ` · R${quotation.revision}` : ''}
            </span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={STATUS_TONE[quotation.status]} label={statusT(quotation.status)} />
            {quotation.discountPendingApproval && (
              <Badge variant="accent">{t('approvalPending')}</Badge>
            )}
            <span className="type-body-sm text-ink-faint">
              {t('dates', {
                created: date(quotation.createdAt),
                valid: date(quotation.validUntil),
              })}
            </span>
          </span>
        }
      />
      <div className="-mt-4 flex flex-wrap items-center gap-2 empty:hidden">
        <QuotationActions quotation={quotation} />
      </div>
      {quotation.status === 'rejected' && quotation.rejectionReason && (
        <p className="-mt-4 flex max-w-3xl items-start gap-2.5 rounded-xl border border-hairline bg-raised px-4 py-3 type-body-sm text-ink-muted">
          <MessageSquareX aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          <span>
            <span className="font-medium text-ink">{t('rejected')}</span> ·{' '}
            {t('rejectedReason', { reason: quotation.rejectionReason })}
          </span>
        </p>
      )}
      <ChangeRequestNotice scope={{ quotationId: quotation.id }} className="-mt-4 max-w-3xl" />
      <div className="-mt-4 max-w-3xl empty:hidden">
        <QuotationChangeNote quotationId={quotation.id} />
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(22rem,27rem)_minmax(0,1fr)] lg:items-start">
        <PriceStack totals={quotation.totals} className="lg:sticky lg:top-6" />
        <div className="flex flex-col gap-10">
          <section aria-label={t('customer')} className="flex flex-col gap-5">
            <SectionHeading index="01" title={t('customer')} />
            <PropertySummary propertyId={quotation.input.propertyId} />
          </section>
          <section aria-label={t('system')} className="flex flex-col gap-5">
            <SectionHeading index="02" title={t('system')} />
            <SystemFacts input={quotation.input} capacityWp={quotation.totals.capacityWp} />
          </section>
          <section aria-label={t('lines')} className="flex flex-col gap-5">
            <SectionHeading index="03" title={t('lines')} />
            <QuotationLines
              lines={quotation.lines}
              totals={quotation.totals}
              showMargin={showMargin}
            />
            {showMargin && quotation.costing && <CostBuildup costing={quotation.costing} />}
          </section>
        </div>
      </div>
    </motion.div>
  );
}
