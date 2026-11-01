import type { ResellerCustomer } from '@oneohm/api-contracts';
import {
  ChoiceChips,
  describeError,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { Search, Users } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { RESELLER_CUSTOMERS } from '@/copy/reseller';
import { CustomerRow } from './customer-row';
import { useMyCustomers } from './use-reseller';

type Filter = keyof typeof RESELLER_CUSTOMERS.filters;

function matches(customer: ResellerCustomer, filter: Filter, search: string): boolean {
  const term = search.trim().toLowerCase();
  const words = [customer.name, customer.city, customer.project?.code ?? ''];
  if (term && !words.some((value) => value.toLowerCase().includes(term))) return false;
  const status = customer.project?.status;
  if (filter === 'leads') return !customer.project;
  if (filter === 'projects') return status === 'active';
  if (filter === 'done') return status === 'operational' || status === 'completed';
  return true;
}

/** The reseller's own customers and how each project is going (PRD 4.8). */
export function CustomersScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const query = useMyCustomers();
  const all = query.data ?? [];
  const shown = all.filter((customer) => matches(customer, filter, search));
  const projects = all.filter((customer) => customer.project).length;

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.header}>
        <Text variant="displayLg">{RESELLER_CUSTOMERS.title}</Text>
        {query.data ? (
          <Text variant="bodySm" tone="secondary">
            {RESELLER_CUSTOMERS.subtitle(all.length, projects)}
          </Text>
        ) : null}
      </View>
      <Input
        value={search}
        onChangeText={setSearch}
        placeholder={RESELLER_CUSTOMERS.search}
        accessibilityLabel={RESELLER_CUSTOMERS.search}
        leading={<Search size={18} color={theme.colors.textTertiary} />}
      />
      <ChoiceChips
        label={RESELLER_CUSTOMERS.filterLabel}
        choices={(Object.keys(RESELLER_CUSTOMERS.filters) as Filter[]).map((value) => ({
          value,
          label: RESELLER_CUSTOMERS.filters[value],
        }))}
        value={filter}
        onChange={setFilter}
      />
      {query.isPending ? <LoadingState label={RESELLER_CUSTOMERS.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && shown.length === 0 ? (
        <EmptyState
          icon={<Users size={22} color={theme.colors.accent} />}
          title={RESELLER_CUSTOMERS.emptyTitle}
          description={RESELLER_CUSTOMERS.emptyBody}
        />
      ) : null}
      <View style={styles.list}>
        {shown.map((customer) => (
          <CustomerRow key={customer.leadId} customer={customer} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingTop: 8 },
  list: { gap: 10 },
});
