'use client';

import type { ReconciliationRow, StockRow } from '@oneohm/api-contracts';
import { Input, Select } from '@oneohm/design-system/web';
import { roundQuantity } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { formatQuantity } from '../use-inventory';

export interface IssueDraft {
  readonly productId: string | undefined;
  readonly quantity: string;
}

/** Stock items that can serve a quotation line: same kind, or the very item it names. */
export function optionsFor(row: ReconciliationRow, stock: readonly StockRow[]) {
  return stock.filter(
    (item) => item.productId === row.quoteProductId || item.category === row.category,
  );
}

/** Free at the store, plus what this project already holds there when it is the quoted item. */
export function freeAt(item: StockRow | undefined, locationId: string, row: ReconciliationRow) {
  const level = item?.byLocation.find((entry) => entry.locationId === locationId);
  if (!level) return 0;
  const own = item?.productId === row.quoteProductId ? (row.reserved ?? 0) : 0;
  return roundQuantity(Math.max(0, level.onHand - level.reserved) + own);
}

/** One line per quotation goods line: which stock item and how much. */
export function IssueLines({
  rows,
  stock,
  locationId,
  drafts,
  errors,
  onChange,
}: {
  readonly rows: readonly ReconciliationRow[];
  readonly stock: readonly StockRow[];
  readonly locationId: string;
  readonly drafts: Readonly<Record<string, IssueDraft>>;
  /** Messages keyed by quotation line. */
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (lineKey: string, draft: IssueDraft) => void;
}) {
  const t = useTranslations('inventory.custody.issueForm');
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {rows.map((row) => {
        const key = row.lineKey ?? '';
        const draft = drafts[key] ?? { productId: undefined, quantity: '' };
        const options = optionsFor(row, stock);
        const item = options.find((option) => option.productId === draft.productId);
        const remaining = Math.max(0, (row.needed ?? 0) - row.issued + row.returned);
        const free = freeAt(item, locationId, row);
        const error = errors[key];
        return (
          <li key={key} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="type-body-sm font-medium text-ink">{row.description}</span>
              <span className="type-label text-ink-faint">
                {t('toIssue', {
                  remaining: formatQuantity(remaining),
                  unit: row.unit,
                  free: item ? `${formatQuantity(free)} ${item.unit}` : '—',
                })}
              </span>
            </div>
            {options.length === 0 ? (
              <p className="type-label text-ink-muted">{t('noStock')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Select
                  label={`${t('product')}: ${row.description}`}
                  value={draft.productId}
                  onValueChange={(productId) => onChange(key, { ...draft, productId })}
                  options={options.map((option) => ({
                    value: option.productId,
                    label: option.name,
                    description: `${option.brand} · ${formatQuantity(option.available)} ${option.unit}`,
                  }))}
                />
                <Input
                  aria-label={`${t('quantity')}: ${row.description}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={draft.quantity}
                  onChange={(event) => onChange(key, { ...draft, quantity: event.target.value })}
                  className="font-mono tabular-nums"
                />
              </div>
            )}
            {error && <p className="type-label text-at-risk">{error}</p>}
          </li>
        );
      })}
    </ul>
  );
}
