'use client';

import { Input, SegmentedControl } from '@oneohm/design-system/web';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ChangesTable } from './changes-table';
import { SignInsTable } from './sign-ins-table';

type View = 'changes' | 'signIns';

/** Who did what, and every sign-in try: the audit trail owners can read (PRD 7.3). */
export function ActivityPanel() {
  const t = useTranslations('settings.activity');
  const [view, setView] = useState<View>('changes');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 300);
  return (
    <section className="flex flex-col gap-5">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="type-display-md text-ink">{t('title')}</h2>
        <p className="type-body text-ink-muted">{t('intro')}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<View>
          label={t('viewLabel')}
          value={view}
          onValueChange={setView}
          options={[
            { value: 'changes', label: t('changes') },
            { value: 'signIns', label: t('signIns') },
          ]}
          className="self-start"
        />
        <div className="sm:w-80">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={view === 'changes' ? t('search') : t('searchSignIns')}
            aria-label={view === 'changes' ? t('search') : t('searchSignIns')}
            leading={<Search aria-hidden className="size-4" />}
          />
        </div>
      </div>
      {view === 'changes' ? (
        <ChangesTable search={debounced} />
      ) : (
        <SignInsTable search={debounced} />
      )}
    </section>
  );
}
