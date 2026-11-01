import type { Lead } from '@oneohm/api-contracts';
import {
  Button,
  ChoiceChips,
  describeError,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Search, Target } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { COMMON } from '@/copy/common';
import { LEADS } from '@/copy/sales';
import { businessToday } from '@/lib/dates';
import { useCan } from '@/session/session-provider';
import { LeadRow } from './lead-row';

type Filter = keyof typeof LEADS.filters;

function matches(lead: Lead, filter: Filter, search: string, today: string): boolean {
  const term = search.trim().toLowerCase();
  if (
    term &&
    ![lead.name, lead.phone, lead.city].some((value) => value.toLowerCase().includes(term))
  ) {
    return false;
  }
  if (filter === 'due') return lead.overdue || lead.nextActionOn === today;
  if (filter === 'new') return lead.stage === 'new';
  if (filter === 'quoted') return lead.stage === 'quoted';
  return true;
}

/** The person's open leads, follow-ups first, with search and a few calm filters. */
export function LeadsScreen() {
  const theme = useTheme();
  const canCreate = useCan('leads.manage');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: keys.leads,
    queryFn: () => unwrap(api.crm.listLeads({ query: { open: true } })),
  });
  const today = businessToday();
  const leads = (query.data ?? [])
    .filter((lead) => matches(lead, filter, search, today))
    .sort((left, right) =>
      (left.nextActionOn ?? '9999').localeCompare(right.nextActionOn ?? '9999'),
    );
  const due = (query.data ?? []).filter(
    (lead) => lead.overdue || lead.nextActionOn === today,
  ).length;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="displayLg">{LEADS.title}</Text>
          {query.data ? (
            <Text variant="bodySm" tone="secondary">
              {LEADS.subtitle(query.data.length, due)}
            </Text>
          ) : null}
        </View>
        {canCreate ? (
          <Button
            label={LEADS.new}
            size="sm"
            icon={<Plus size={16} color={theme.colors.onAccent} />}
            onPress={() => router.push('/leads/new')}
          />
        ) : null}
      </View>
      <Input
        value={search}
        onChangeText={setSearch}
        placeholder={LEADS.search}
        accessibilityLabel={LEADS.search}
        leading={<Search size={18} color={theme.colors.textTertiary} />}
      />
      <ChoiceChips
        label={LEADS.filterLabel}
        choices={(Object.keys(LEADS.filters) as Filter[]).map((value) => ({
          value,
          label: LEADS.filters[value],
        }))}
        value={filter}
        onChange={setFilter}
      />
      {query.isPending ? <LoadingState label={LEADS.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && leads.length === 0 ? (
        <EmptyState
          icon={<Target size={22} color={theme.colors.accent} />}
          title={LEADS.emptyTitle}
          description={LEADS.emptyBody}
        />
      ) : null}
      <View style={styles.list}>
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 8 },
  flex: { flex: 1, gap: 4 },
  list: { gap: 10 },
});
