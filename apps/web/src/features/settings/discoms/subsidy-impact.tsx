'use client';

import type { SubsidyImpactRow } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  Sheet,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useSubsidyImpact } from './use-subsidy-rules';

function Change({ now, was }: { readonly now: number; readonly was: number }) {
  const t = useTranslations('settings.subsidy.impact');
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="whitespace-nowrap font-mono font-medium text-ink tabular-nums">
        {formatInr(now)}
      </span>
      <span className="whitespace-nowrap type-body-sm text-ink-faint line-through decoration-ink-faint/60">
        {t('was', { amount: formatInr(was) })}
      </span>
    </span>
  );
}

/**
 * Open quotations whose expected subsidy differs under the rules in force on `asOf`:
 * saved against new subsidy and effective price, each opening its quotation.
 */
export function SubsidyImpactList({ asOf }: { readonly asOf: string }) {
  const t = useTranslations('settings.subsidy.impact');
  const format = useFormatter();
  const impact = useSubsidyImpact(asOf);
  if (impact.isPending) return <ListSkeleton label={t('loading')} rows={3} />;
  if (impact.isError) return <LoadError error={impact.error} onRetry={() => impact.refetch()} />;
  const { checked, quotations } = impact.data;

  const columns: TableColumn<SubsidyImpactRow>[] = [
    {
      key: 'quotation',
      header: t('columns.quotation'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={`/quotations/${row.id}`}
              className="oh-stretched-link whitespace-nowrap font-mono text-[0.875rem] text-ink hover:text-accent"
            >
              {row.number}
              {row.revision > 1 && <span className="text-ink-faint"> · R{row.revision}</span>}
            </Link>
            <StatusPill
              tone={row.status === 'sent' ? 'review' : 'neutral'}
              label={t(`statuses.${row.status}`)}
              size="sm"
            />
          </span>
          <span className="truncate type-body-sm text-ink-muted">
            {row.customer.name} · {row.propertyLabel} · {formatKwp(row.capacityWp)}
          </span>
        </span>
      ),
    },
    {
      key: 'subsidy',
      header: t('columns.subsidy'),
      align: 'end',
      cell: (row) => <Change now={row.newSubsidyPaise} was={row.savedSubsidyPaise} />,
    },
    {
      key: 'effective',
      header: t('columns.effective'),
      align: 'end',
      cell: (row) => <Change now={row.newEffectivePaise} was={row.savedEffectivePaise} />,
    },
    {
      key: 'validUntil',
      header: t('columns.validUntil'),
      align: 'end',
      hideOnPhone: true,
      cell: (row) => (
        <span className="whitespace-nowrap type-body-sm text-ink-muted">
          {format.dateTime(new Date(row.validUntil), { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="type-body text-ink">
          {t('summary', { checked, changed: quotations.length })}
        </p>
        <p className="type-body-sm text-ink-faint">{t('note')}</p>
      </div>
      {quotations.length === 0 ? (
        <EmptyState icon={<CircleCheck />} title={t('noneTitle')} description={t('noneBody')} />
      ) : (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={quotations}
          rowKey={(row) => row.id}
        />
      )}
    </div>
  );
}

/** The impact check on its own, from "Check open quotations" or a scheduled version. */
export function SubsidyImpactSheet({
  asOf,
  onClose,
}: {
  readonly asOf: string | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.subsidy.impact');
  const format = useFormatter();
  return (
    <Sheet
      open={asOf !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={
        asOf
          ? t('asOf', { date: format.dateTime(new Date(asOf), { dateStyle: 'medium' }) })
          : undefined
      }
      width="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <div className="px-5 py-5 sm:px-6">{asOf && <SubsidyImpactList asOf={asOf} />}</div>
    </Sheet>
  );
}
