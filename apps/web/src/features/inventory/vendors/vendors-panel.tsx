'use client';

import { Button, EmptyState, Input, ResponsiveTable, Select } from '@oneohm/design-system/web';
import { Plus, Search, Store } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { useScorecards } from '../../purchasing/use-purchasing';
import { useVendorColumns } from '../../purchasing/vendors/vendor-columns';
import {
  readVendorFilters,
  SHOW_FILTERS,
  SORTS,
  type VendorFilters,
  vendorRows,
} from '../../purchasing/vendors/vendor-filters';
import { useVendors } from '../use-inventory';
import { VendorDialog } from './vendor-dialog';

/**
 * Who OneOhm buys from, with how each one performs (PRD 3.10): ordered, on time,
 * days to deliver, inspection failures, what is owed and advanced. Filters live in the URL.
 */
export function VendorsPanel() {
  const t = useTranslations('inventory.vendors');
  const tv = useTranslations('purchasing.vendors');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const vendors = useVendors();
  const cards = useScorecards();
  const columns = useVendorColumns();
  const canManage = useCan('procurement.manage');
  const [adding, setAdding] = useState(false);
  const filters = readVendorFilters(params);
  const [search, setSearch] = useState(filters.search);

  const setFilter = useCallback(
    (patch: Partial<VendorFilters>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        const name = key === 'search' ? 'q' : key;
        if (value) next.set(name, value);
        else next.delete(name);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  useEffect(() => {
    if (search.trim() === filters.search) return;
    const timer = window.setTimeout(() => setFilter({ search: search.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [search, filters.search, setFilter]);

  if (vendors.isPending || cards.isPending) return <ListSkeleton label={t('loading')} />;
  if (vendors.isError) return <LoadError error={vendors.error} onRetry={() => vendors.refetch()} />;
  const rows = vendorRows(vendors.data, cards.data ?? [], filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tv('filters.search')}
            aria-label={tv('filters.search')}
            leading={<Search aria-hidden />}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            label={tv('filters.show')}
            value={filters.show}
            onValueChange={(show) => setFilter({ show })}
            options={SHOW_FILTERS.map((value) => ({ value, label: tv(`filters.shows.${value}`) }))}
            className="sm:w-44"
          />
          <Select
            label={tv('filters.sort')}
            value={filters.sort}
            onValueChange={(sort) => setFilter({ sort })}
            options={SORTS.map((value) => ({ value, label: tv(`filters.sorts.${value}`) }))}
            className="sm:w-48"
          />
        </div>
        {canManage && (
          <Button
            variant="primary"
            leadingIcon={<Plus />}
            onClick={() => setAdding(true)}
            className="lg:ml-auto"
          >
            {t('new')}
          </Button>
        )}
      </div>
      {vendors.data.length === 0 ? (
        <EmptyState icon={<Store />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Search />} title={tv('noMatchTitle')} description={tv('noMatchBody')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.vendor.id}
        />
      )}
      <VendorDialog open={adding} vendor={null} onClose={() => setAdding(false)} />
    </div>
  );
}
