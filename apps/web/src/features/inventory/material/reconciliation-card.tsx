'use client';

import type { ProjectCustody, ReconciliationRow } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  cn,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatQuantity } from '../use-inventory';

const amount = (value: number | null) => (value === null ? '—' : formatQuantity(value));
const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatQuantity(Math.abs(value))}`;

/**
 * Per quotation line: needed, reserved, dispatched, issued, used and returned, what is
 * still with a contractor, and use against the quote. After installation, a line whose
 * issued less used less returned is not zero is flagged.
 */
export function ReconciliationCard({ custody }: { readonly custody: ProjectCustody }) {
  const t = useTranslations('inventory.custody');
  const warnings = custody.rows.filter((row) => row.warning !== null);
  const number = (key: keyof ReconciliationRow, header: string, hideOnPhone = false) =>
    ({
      key,
      header,
      align: 'end',
      hideOnPhone,
      className: 'font-mono text-[0.8125rem] tabular-nums whitespace-nowrap',
      cell: (row) => amount(row[key] as number | null),
    }) satisfies TableColumn<ReconciliationRow>;
  const columns: TableColumn<ReconciliationRow>[] = [
    {
      key: 'item',
      header: t('columns.item'),
      primary: true,
      cell: (row) => <ItemCell row={row} />,
    },
    number('needed', t('columns.needed')),
    number('reserved', t('columns.reserved'), true),
    number('dispatched', t('columns.dispatched'), true),
    number('issued', t('columns.issued')),
    number('used', t('columns.used')),
    number('returned', t('columns.returned')),
    {
      key: 'withContractor',
      header: t('columns.withContractor'),
      align: 'end',
      className: 'font-mono text-[0.8125rem] tabular-nums whitespace-nowrap',
      cell: (row) => (
        <span className={cn(row.warning === 'unaccounted' && 'font-semibold text-at-risk')}>
          {formatQuantity(row.withContractor)}
        </span>
      ),
    },
    {
      key: 'difference',
      header: t('columns.difference'),
      align: 'end',
      className: 'font-mono text-[0.8125rem] tabular-nums whitespace-nowrap',
      cell: (row) =>
        row.difference === null ? (
          '—'
        ) : (
          <span className={cn(row.difference > 0.0005 && 'text-at-risk')}>
            {signed(row.difference)}
          </span>
        ),
    },
  ];

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={t('reconcileTitle')}
        description={t('reconcileDescription')}
        action={
          <StatusPill
            tone={custody.installed ? 'done' : 'neutral'}
            label={t(custody.installed ? 'installed' : 'inProgress')}
            size="sm"
          />
        }
      />
      {warnings.length > 0 && (
        <div
          role="status"
          className="flex gap-3 border-t border-hairline bg-at-risk-tint px-5 py-3"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
          <div className="flex flex-col gap-0.5">
            <p className="type-body-sm font-medium text-at-risk">
              {t('warningsTitle', { count: warnings.length })}
            </p>
            <p className="type-label text-ink-muted">{t('warningsBody')}</p>
          </div>
        </div>
      )}
      <div className="border-t border-hairline px-1 pb-2 md:px-0">
        <ResponsiveTable
          caption={t('reconcileTitle')}
          columns={columns}
          rows={custody.rows}
          rowKey={(row) => row.lineKey ?? `extra-${row.description}`}
        />
      </div>
    </Card>
  );
}

function ItemCell({ row }: { readonly row: ReconciliationRow }) {
  const t = useTranslations('inventory.custody');
  const issuedAs = row.productNames.filter((name) => name !== row.description);
  const gap = Math.abs(row.warning === 'unaccounted' ? row.withContractor : (row.difference ?? 0));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="type-body-sm font-medium text-ink">{row.description}</span>
      <span className="type-label text-ink-faint">
        {row.lineKey === null
          ? t('extra')
          : row.reserved === null
            ? `${row.unit} · ${t('notTracked')}`
            : row.unit}
        {issuedAs.length > 0 && ` · ${t('issuedAs', { names: issuedAs.join(', ') })}`}
      </span>
      {row.warning && (
        <span className="type-label font-medium text-at-risk">
          {t(`warnings.${row.warning}`, { quantity: formatQuantity(gap), unit: row.unit })}
        </span>
      )}
    </div>
  );
}
