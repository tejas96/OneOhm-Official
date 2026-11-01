import type { SearchHit } from '@oneohm/api-contracts';
import {
  describeError,
  EmptyState,
  ErrorState,
  Input,
  Screen,
  SkeletonRows,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Search, SearchX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { ScreenHeader, SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { SEARCH } from '@/copy/search';
import { RecordSheet } from './record-sheet';
import { FIELD_SEARCH_TYPES, groupHits, searchable } from './search-groups';
import { SearchRow } from './search-row';

/** The query once typing has paused, so each keystroke is not a request. */
function useSettled(value: string, delayMs = 250): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/**
 * Universal search on the phone (PRD 10): projects, customers, leads and tasks the person
 * may open. The server narrows crews to their own tasks and resellers to their own leads.
 */
export function SearchScreen() {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<SearchHit | null>(null);
  const settled = useSettled(text.trim());
  const query = useQuery({
    queryKey: ['search', 'field', settled],
    queryFn: () =>
      unwrap(
        api.search.search({
          query: { q: settled, types: FIELD_SEARCH_TYPES.join(','), limit: 8 },
        }),
      ),
    enabled: searchable(settled),
    placeholderData: keepPreviousData,
  });
  const asked = searchable(text);
  const groups = asked ? groupHits(query.data?.hits ?? []) : [];
  const waiting = asked && (text.trim() !== settled || query.isFetching) && groups.length === 0;

  const openHit = (hit: SearchHit) => {
    if (hit.type === 'tasks') router.push(`/tasks/${hit.id}`);
    else if (hit.type === 'leads') router.push(`/leads/${hit.id}`);
    else setOpen(hit);
  };

  return (
    <Screen>
      <ScreenHeader overline={SEARCH.overline} title={SEARCH.title} />
      <Input
        value={text}
        onChangeText={setText}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        placeholder={SEARCH.placeholder}
        accessibilityLabel={SEARCH.label}
        leading={<Search size={18} color={theme.colors.textTertiary} />}
      />
      {!asked ? (
        <Text variant="bodySm" tone="secondary">
          {SEARCH.hint}
        </Text>
      ) : null}
      {waiting ? <SkeletonRows label={SEARCH.loading} rows={4} /> : null}
      {asked && query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {asked && !waiting && query.data && groups.length === 0 ? (
        <EmptyState
          icon={<SearchX size={22} color={theme.colors.accent} />}
          title={SEARCH.emptyTitle(text.trim())}
          description={SEARCH.emptyBody}
        />
      ) : null}
      {groups.map((group) => (
        <View key={group.type} style={styles.group}>
          <SectionTitle title={SEARCH.groups[group.type]} count={group.hits.length} />
          {group.hits.map((hit) => (
            <SearchRow key={hit.id} hit={hit} onOpen={openHit} />
          ))}
        </View>
      ))}
      <RecordSheet hit={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
});
