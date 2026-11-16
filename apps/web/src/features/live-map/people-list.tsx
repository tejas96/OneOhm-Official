'use client';

import type { LivePerson } from '@oneohm/api-contracts';
import { Input } from '@oneohm/design-system/web';
import { Search, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type LiveFilter, matchesFilter, matchesSearch, sortPeople } from './live-format';
import { PersonAvatar, useDoing, useLastSeen } from './person-bits';
import { useNow } from './use-live';

interface PeopleListProps {
  readonly people: readonly LivePerson[];
  readonly filter: LiveFilter;
  readonly onClearFilter: () => void;
  readonly onOpen: (id: string) => void;
}

/** Everyone the manager looks after: search, then one row each with what they are doing. */
export function PeopleList({ people, filter, onClearFilter, onOpen }: PeopleListProps) {
  const t = useTranslations('liveMap');
  const [query, setQuery] = useState('');
  const now = useNow(15_000);
  const doing = useDoing();
  const seen = useLastSeen();
  const rows = sortPeople(people).filter(
    (person) => matchesFilter(person.state, filter) && matchesSearch(person, query),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-1 pb-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          leading={<Search aria-hidden className="size-4" />}
        />
        {filter !== 'all' && (
          <p className="mt-2 flex items-center justify-between type-label text-ink-muted">
            {t('list.filtered', { filter: t(`chip.${filter}`) })}
            <button type="button" onClick={onClearFilter} className="text-accent hover:underline">
              {t('list.showAll')}
            </button>
          </p>
        )}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {rows.length === 0 && (
          <li className="px-3 py-8 text-center type-body-sm text-ink-muted">{t('list.none')}</li>
        )}
        {rows.map((person) => {
          const last = seen(person, now);
          return (
            <li key={person.person.id}>
              <button
                type="button"
                onClick={() => onOpen(person.person.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-(--duration-fast) hover:bg-sunken focus-visible:bg-sunken"
              >
                <PersonAvatar person={person} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 truncate type-body text-ink">
                    <span className="truncate font-medium">{person.person.fullName}</span>
                    {person.flags.mockedToday && (
                      <TriangleAlert
                        aria-label={t('card.mocked')}
                        className="size-3.5 shrink-0 text-overdue"
                      />
                    )}
                  </span>
                  <span className="truncate type-body-sm text-ink-muted">{doing(person, now)}</span>
                </span>
                {last && (
                  <span className="shrink-0 type-label tabular-nums text-ink-faint">{last}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
