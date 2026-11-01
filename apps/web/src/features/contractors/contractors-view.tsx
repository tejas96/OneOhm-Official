'use client';

import { Button, EmptyState, Input, PageHeader, pageEnter } from '@oneohm/design-system/web';
import { HardHat, Plus, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ContractorCard } from './contractor-card';
import { ContractorCreateDialog } from './contractor-create-dialog';
import { useContractors } from './use-contractors';

/** Every I&C partner and labour contractor, with delivery, quality and money owed. */
export function ContractorsView() {
  const t = useTranslations('contractors');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search.trim(), 300);
  const contractors = useContractors(debounced);

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
      <div className="sm:max-w-md">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          leading={<Search aria-hidden className="size-4" />}
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
      {contractors.data && contractors.data.length > 0 && (
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
