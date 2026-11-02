'use client';

import type { PointsEntry } from '@oneohm/api-contracts';
import { Badge, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { PersonChip } from '../person-chip';
import { DECISION_TONE, useWorkforceFormat } from '../workforce-format';

const SHOWN = 20;

/** The latest decided points, newest first: who, how many, and why. */
export function RecentPoints({ entries }: { readonly entries: readonly PointsEntry[] }) {
  const t = useTranslations('team.points.recent');
  const sourceT = useTranslations('team.points.source');
  const statusT = useTranslations('team.leave.status');
  const format = useWorkforceFormat();
  const rows = entries
    .filter((entry) => entry.status !== 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, SHOWN);

  const columns: readonly TableColumn<PointsEntry>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (entry) => <PersonChip person={entry.user} detail={format.ago(entry.createdAt)} />,
    },
    {
      key: 'points',
      header: t('columns.points'),
      align: 'end',
      cell: (entry) => (
        <span
          className={
            entry.status === 'approved'
              ? 'font-mono text-[0.875rem] text-ink tabular-nums'
              : 'font-mono text-[0.875rem] text-ink-faint tabular-nums line-through'
          }
        >
          +{entry.points}
        </span>
      ),
    },
    {
      key: 'reason',
      header: t('columns.reason'),
      className: 'md:max-w-md',
      cell: (entry) => <span className="type-body-sm text-ink-muted">{entry.reason}</span>,
    },
    {
      key: 'source',
      header: t('columns.source'),
      cell: (entry) => <Badge variant="soft">{sourceT(entry.sourceType)}</Badge>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (entry) => (
        <StatusPill size="sm" tone={DECISION_TONE[entry.status]} label={statusT(entry.status)} />
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-title-lg text-ink">{t('title')}</h2>
        <p className="type-body-sm text-ink-faint">{t('description')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="type-body-sm text-ink-faint">{t('none')}</p>
      ) : (
        // Many columns: the table scrolls sideways in its own box, never the page.
        <div className="min-w-0 overflow-x-auto">
          <ResponsiveTable
            caption={t('title')}
            columns={columns}
            rows={rows}
            rowKey={(entry) => entry.id}
          />
        </div>
      )}
    </section>
  );
}
