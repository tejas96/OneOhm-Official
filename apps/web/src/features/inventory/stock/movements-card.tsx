'use client';

import type { StockRow } from '@oneohm/api-contracts';
import { Card, CardHeader, Input, Select } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';
import { useNow, useTranslations } from 'next-intl';
import { LoadMore } from '@/components/load-more';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useChoiceParam } from '@/lib/use-choice-param';
import { useProgressiveList } from '@/lib/use-progressive-list';
import { useSearchParam } from '@/lib/use-search-param';
import { useMovements } from '../use-inventory';
import { MovementRow } from './movement-row';
import { MOVEMENTS_LIMIT, matchesMovement } from './stock-filters';

const ALL = 'all';

/**
 * The stock ledger, newest first. `?item=` asks the server for one product's movements
 * (so its older ones show too); `?mq=` searches what is loaded. Draws 40 at a time.
 */
export function MovementsCard({ products }: { readonly products: readonly StockRow[] }) {
  const t = useTranslations('inventory.stock');
  const now = useNow({ updateInterval: 60_000 });
  const [item, setItem] = useChoiceParam<string>(
    'item',
    products.map((product) => product.productId),
    ALL,
  );
  const { draft, setDraft, search } = useSearchParam('mq');
  const movements = useMovements(item === ALL ? undefined : item);
  const matched = (movements.data ?? []).filter((movement) =>
    matchesMovement(search, movement, t(`kinds.${movement.kind}`)),
  );
  const list = useProgressiveList(matched, 40, `${item}|${search}`);
  const capped = (movements.data?.length ?? 0) >= MOVEMENTS_LIMIT;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title={t('movementsTitle')} description={t('movementsDescription')} />
      <div className="flex flex-col gap-2 px-5 pb-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <Input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('movementsSearch')}
            aria-label={t('movementsSearch')}
            leading={<Search aria-hidden />}
          />
        </div>
        <Select
          label={t('movementsItem')}
          value={item}
          onValueChange={setItem}
          options={[
            { value: ALL, label: t('movementsAllItems') },
            ...products.map((product) => ({
              value: product.productId,
              label: `${product.name} · ${product.sku}`,
            })),
          ]}
          className="sm:w-64"
        />
      </div>
      <div className="border-t border-hairline">
        {movements.isPending && (
          <div className="p-5">
            <ListSkeleton label={t('movementsTitle')} rows={3} />
          </div>
        )}
        {movements.isError && (
          <LoadError error={movements.error} onRetry={() => movements.refetch()} className="m-5" />
        )}
        {movements.data && list.total === 0 && (
          <p className="px-5 py-6 type-body-sm text-ink-muted">
            {movements.data.length === 0 ? t('movementsEmpty') : t('movementsNoMatch')}
          </p>
        )}
        <ul className="flex flex-col divide-y divide-hairline">
          {list.items.map((movement) => (
            <MovementRow key={movement.id} movement={movement} now={now} />
          ))}
        </ul>
        <LoadMore
          shown={list.items.length}
          total={list.total}
          hasMore={list.hasMore}
          loading={false}
          onMore={list.loadMore}
          className="border-t border-hairline pt-4"
        />
        {capped && !list.hasMore && (
          <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-muted">
            {item === ALL
              ? t('movementsCapped', { count: MOVEMENTS_LIMIT })
              : t('movementsCappedItem', { count: MOVEMENTS_LIMIT })}
          </p>
        )}
      </div>
    </Card>
  );
}
