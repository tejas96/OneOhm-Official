import type { ServiceRequest } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  type Tone,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LifeBuoy, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { SectionTitle } from '@/components/screen-header';
import { SUPPORT } from '@/copy/care';
import { COMMON } from '@/copy/common';
import { momentDate } from '@/lib/dates';

const TONE: Readonly<Record<ServiceRequest['status'], Tone>> = {
  open: 'waiting',
  in_progress: 'onTrack',
  resolved: 'done',
};

/** Ask for help with an installed system and follow what happens (PRD 5.5). */
export function HelpScreen() {
  const theme = useTheme();
  const query = useQuery({
    queryKey: keys.service,
    queryFn: () => unwrap(api.customer.listServiceRequests()),
  });
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View style={styles.head}>
        <Text variant="displayLg">{SUPPORT.title}</Text>
        <Text variant="body" tone="secondary">
          {SUPPORT.intro}
        </Text>
        <Button
          label={SUPPORT.newRequest}
          icon={<Plus size={18} color={theme.colors.onAccent} />}
          onPress={() => router.push('/help/new')}
          fullWidth
        />
      </View>
      <View style={styles.section}>
        <SectionTitle
          title={SUPPORT.historyTitle.toUpperCase()}
          {...(query.data ? { count: query.data.length } : {})}
        />
        {query.isPending ? <LoadingState label={SUPPORT.loading} /> : null}
        {query.isError ? (
          <ErrorState
            title={COMMON.loadError}
            message={describeError(query.error)}
            retryLabel={COMMON.retry}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {query.data?.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy size={22} color={theme.colors.accent} />}
            title={SUPPORT.emptyTitle}
            description={SUPPORT.emptyBody}
          />
        ) : null}
        {query.data?.map((request) => (
          <RequestCard key={request.id} request={request} />
        ))}
      </View>
    </Screen>
  );
}

function RequestCard({ request }: { readonly request: ServiceRequest }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text variant="titleMd" style={styles.grow}>
          {SUPPORT.category[request.category]}
        </Text>
        <StatusPill size="sm" tone={TONE[request.status]} label={SUPPORT.status[request.status]} />
      </View>
      <Text variant="body" tone="secondary">
        {request.description}
      </Text>
      {request.resolutionNote ? (
        <View style={styles.resolution}>
          <Text variant="overline" tone="tertiary">
            {SUPPORT.resolution.toUpperCase()}
          </Text>
          <Text variant="bodySm">{request.resolutionNote}</Text>
        </View>
      ) : null}
      <Text variant="label" tone="tertiary">
        {[
          request.projectCode,
          SUPPORT.raisedOn(momentDate(request.createdAt)),
          request.photoCount > 0 ? SUPPORT.photoCount(request.photoCount) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: 12, paddingTop: 8 },
  section: { gap: 10 },
  card: { gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  grow: { flex: 1 },
  resolution: { gap: 2 },
});
