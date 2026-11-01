'use client';

import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  SegmentedControl,
} from '@oneohm/design-system/web';
import { HardHat, LayoutGrid, Plus, Rows3, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ContractorCard } from './contractor-card';
import { ContractorCreateDialog } from './contractor-create-dialog';
import { ContractorsTable } from './contractors-table';
import { useContractors } from './use-contractors';

/** Every I&C partner and labour contractor, with delivery, quality and money owed. */
export function ContractorsView() {
  const t = useTranslations('contractors');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search.trim(), 300);
  const contractors = useContractors(debounced);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get('view') === 'table' ? 'table' : 'cards';
  const setView = (next: 'cards' | 'table') => {
    const query = new URLSearchParams(params);
    if (next === 'table') query.set('view', 'table');
    else query.delete('view');
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ''}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
            {t('add')}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-full sm:max-w-md">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            leading={<Search aria-hidden className="size-4" />}
          />
        </div>
        <SegmentedControl
          label={t('layout.label')}
          value={view}
          onValueChange={setView}
          options={[
            { value: 'cards', label: t('layout.cards'), icon: <LayoutGrid aria-hidden /> },
            { value: 'table', label: t('layout.table'), icon: <Rows3 aria-hidden /> },
          ]}
          className="self-start"
        />
      </div>
      {contractors.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {contractors.isError && (
        <LoadError error={contractors.error} onRetry={() => contractors.refetch()} />
      )}
      {contractors.data && contractors.data.length === 0 && (
        <EmptyState
          icon={<HardHat />}
          title={debounced ? t('noMatch') : t('emptyTitle')}
          description={debounced ? undefined : t('emptyBody')}
          action={
            debounced ? undefined : (
              <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
                {t('add')}
              </Button>
            )
          }
        />
      )}
      {contractors.data && contractors.data.length > 0 && view === 'table' && (
        <ContractorsTable rows={contractors.data} />
      )}
      {contractors.data && contractors.data.length > 0 && view === 'cards' && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contractors.data.map((contractor, index) => (
            <ContractorCard key={contractor.id} contractor={contractor} index={index} />
          ))}
        </ul>
      )}
      <ContractorCreateDialog open={creating} onOpenChange={setCreating} />
    </motion.div>
  );
}
