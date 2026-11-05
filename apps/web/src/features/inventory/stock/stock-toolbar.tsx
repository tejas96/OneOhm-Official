'use client';

import { Input, Select } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useChoiceParam } from '@/lib/use-choice-param';
import { useSearchParam } from '@/lib/use-search-param';
import {
  STOCK_CATEGORIES,
  STOCK_SHOWS,
  type StockCategory,
  type StockFilters,
  type StockShow,
} from './stock-filters';

/** The stock table's search (`?q=`), show (`?show=`) and category (`?category=`), in the address. */
export function useStockFilters() {
  const { draft, setDraft, search } = useSearchParam('q');
  const [show, setShow] = useChoiceParam<StockShow>('show', STOCK_SHOWS, 'all');
  const [category, setCategory] = useChoiceParam<StockCategory>(
    'category',
    STOCK_CATEGORIES,
    'all',
  );
  const filters: StockFilters = { search, show, category };
  return { filters, draft, setDraft, setShow, setCategory };
}

export function StockToolbar({
  draft,
  setDraft,
  filters,
  setShow,
  setCategory,
}: ReturnType<typeof useStockFilters>) {
  const t = useTranslations('inventory.stock.filters');
  const categoryT = useTranslations('inventory.categories');
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 lg:max-w-sm">
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          leading={<Search aria-hidden />}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Select
          label={t('show')}
          value={filters.show}
          onValueChange={setShow}
          options={STOCK_SHOWS.map((value) => ({ value, label: t(`shows.${value}`) }))}
          className="sm:w-44"
        />
        <Select
          label={t('category')}
          value={filters.category}
          onValueChange={setCategory}
          options={STOCK_CATEGORIES.map((value) => ({
            value,
            label: value === 'all' ? t('allCategories') : categoryT(value),
          }))}
          className="sm:w-48"
        />
      </div>
    </div>
  );
}
