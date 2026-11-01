'use client';

import type { SearchType } from '@oneohm/api-contracts';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useAllowedNavigation } from '@/features/shell/use-navigation';
import { useCurrentUser } from '@/providers/current-user';
import { entryOf, type StateWords } from './hit-entry';
import { haystackOf, normalise, type SearchEntry } from './search-index';
import { useSearchRecords } from './use-search-records';

/** The pages this person may open, as palette entries (matched in the browser). */
function usePageEntries(): SearchEntry[] {
  const t = useTranslations('nav');
  const groups = useAllowedNavigation();
  return useMemo(
    () =>
      groups.flatMap((group) =>
        group.items
          .filter((item) => item.built)
          .map((item) => {
            const title = t(`items.${item.key}`);
            const groupName = group.key ? t(`groups.${group.key}`) : '';
            return {
              id: `pages:${item.key}`,
              group: 'pages' as const,
              title,
              detail: groupName,
              href: item.href,
              icon: item.icon,
              haystack: haystackOf([title, groupName, item.key]),
              keys: [normalise(title)],
            };
          }),
      ),
    [groups, t],
  );
}

/** Words for each kind's state: lead stages, statuses and file categories, else the value. */
function useStateWords(): StateWords {
  const t = useTranslations('search.states');
  const leads = useTranslations('leads.stage');
  const quotations = useTranslations('quotations.status');
  const documents = useTranslations('documents.categories');
  return useMemo<StateWords>(() => {
    // Kinds whose states are already worded on their own screens.
    const own: Partial<Record<SearchType, (state: string) => string | null>> = {
      leads: (state) => (leads.has(state) ? leads(state) : null),
      quotations: (state) => (quotations.has(state) ? quotations(state) : null),
      documents: (state) => (documents.has(state) ? documents(state) : null),
    };
    const ours = (type: SearchType, state: string) =>
      t.has(`${type}.${state}`) ? t(`${type}.${state}`) : state;
    return (type, state) => own[type]?.(state) ?? ours(type, state);
  }, [t, leads, quotations, documents]);
}

export interface SearchSource {
  readonly pages: readonly SearchEntry[];
  readonly records: readonly SearchEntry[];
  readonly loading: boolean;
  readonly failed: boolean;
  /** The person may search at least one kind of record (else the palette finds pages only). */
  readonly searchable: boolean;
}

/** Everything the palette can find for what was typed: pages, and records from the server. */
export function useSearchEntries(query: string): SearchSource {
  const pages = usePageEntries();
  const records = useSearchRecords(query);
  const words = useStateWords();
  const user = useCurrentUser();
  const entries = useMemo(
    () => records.hits.map((hit) => entryOf(hit, words)),
    [records.hits, words],
  );
  return {
    pages,
    records: entries,
    loading: records.loading,
    failed: records.failed,
    // Everyone signed in has some record they may find (their own tasks at least).
    searchable: user.capabilities.length > 0,
  };
}
