'use client';

import type { CustodyHolding, CustodyProject } from '@oneohm/api-contracts';
import {
  Badge,
  Card,
  CardHeader,
  ResponsiveTable,
  Skeleton,
  type TableColumn,
} from '@oneohm/design-system/web';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { settled, useContractorMaterial } from '@/features/inventory/material/use-custody';
import { formatQuantity } from '@/features/inventory/use-inventory';
import { useCan } from '@/providers/current-user';

const mono = 'font-mono text-[0.8125rem] tabular-nums whitespace-nowrap';

/** What this contractor's crews hold, per project: issued, used, returned, still with them. */
export function ContractorMaterialCard({ contractorId }: { readonly contractorId: string }) {
  const t = useTranslations('contractors.material');
  const canView = useCan('contractors.manage', 'inventory.view', 'inventory.manage');
  const query = useContractorMaterial(contractorId, canView);
  if (!canView) return null;
  const open = (query.data?.projects ?? []).filter((group) =>
    group.holdings.some((holding) => !settled(holding)),
  );
  const done = (query.data?.projects.length ?? 0) - open.length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-lg text-ink [font-family:var(--font-display)]">{t('title')}</h2>
        <p className="type-body-sm text-ink-muted">{t('description')}</p>
      </div>
      {query.isPending && <Skeleton className="h-40 rounded-xl" />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && query.data.projects.length === 0 && (
        <p className="rounded-xl border border-dashed border-rule px-5 py-6 type-body-sm text-ink-muted">
          {t('empty')}
        </p>
      )}
      {query.data && query.data.projects.length > 0 && open.length === 0 && (
        <p className="type-body-sm text-ink-muted">{t('allAccounted')}</p>
      )}
      {open.map((group) => (
        <ProjectHoldings key={group.project.id} group={group} />
      ))}
      {open.length > 0 && done > 0 && (
        <p className="type-label text-ink-faint">{t('settled', { count: done })}</p>
      )}
    </section>
  );
}

function ProjectHoldings({ group }: { readonly group: CustodyProject }) {
  const t = useTranslations('contractors.material');
  const rows = group.holdings.filter((holding) => !settled(holding));
  const columns: TableColumn<CustodyHolding>[] = [
    {
      key: 'item',
      header: t('columns.item'),
      primary: true,
      cell: (row) => <span className="type-body-sm text-ink">{row.name}</span>,
    },
    ...(['issued', 'used', 'returned'] as const).map(
      (key): TableColumn<CustodyHolding> => ({
        key,
        header: t(`columns.${key}`),
        align: 'end',
        hideOnPhone: true,
        className: mono,
        cell: (row) => formatQuantity(row[key]),
      }),
    ),
    {
      key: 'balance',
      header: t('columns.balance'),
      align: 'end',
      className: `${mono} font-semibold`,
      cell: (row) => `${formatQuantity(row.balance)} ${row.unit}`,
    },
  ];
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.8125rem] text-ink-muted">{group.project.code}</span>
            {group.project.name}
            {group.installed && <Badge variant="soft">{t('installed')}</Badge>}
          </span>
        }
        description={t('outstanding', { count: rows.length })}
        action={
          <Link
            href={`/projects/${group.project.id}?tab=material`}
            className="inline-flex min-h-11 items-center gap-1 type-body-sm text-accent hover:underline"
          >
            {t('openProject')}
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        }
      />
      <div className="border-t border-hairline px-1 pb-2 md:px-0">
        <ResponsiveTable
          caption={`${t('title')} · ${group.project.code}`}
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.productId}-${row.lineKey ?? ''}`}
        />
      </div>
    </Card>
  );
}
