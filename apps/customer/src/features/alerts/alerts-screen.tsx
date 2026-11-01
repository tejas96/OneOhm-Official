import {
  AlertRow,
  Button,
  Card,
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  useTheme,
} from '@oneohm/mobile-ui';
import { BellOff } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { ALERTS } from '@/copy/alerts';
import { COMMON } from '@/copy/common';
import { shortMoment } from '@/lib/dates';
import { openAlert } from './open-alert';
import { useInbox, useMarkRead } from './use-inbox';

/** Every update for the customer, newest first; tapping one opens what it is about. */
export function AlertsScreen() {
  const theme = useTheme();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = inbox.data?.items ?? [];
  return (
    <Screen refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
      <ScreenHeader
        overline={ALERTS.overline}
        title={ALERTS.title}
        trailing={
          inbox.data && inbox.data.unread > 0 ? (
            <Button
              label={ALERTS.markAll}
              variant="secondary"
              size="sm"
              pending={markRead.isPending}
              onPress={() => markRead.mutate(undefined)}
            />
          ) : null
        }
      />
      {inbox.isPending ? <LoadingState label={ALERTS.loading} /> : null}
      {inbox.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(inbox.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void inbox.refetch()}
        />
      ) : null}
      {inbox.data && items.length === 0 ? (
        <EmptyState
          icon={<BellOff size={22} color={theme.colors.accent} />}
          title={ALERTS.emptyTitle}
          description={ALERTS.emptyBody}
        />
      ) : null}
      {items.length > 0 ? (
        <Card style={styles.list}>
          {items.map((item) => (
            <AlertRow
              key={item.id}
              item={item}
              time={shortMoment(item.createdAt)}
              onPress={() => {
                if (!item.read) markRead.mutate([item.id]);
                openAlert(item.kind);
              }}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 0 },
});
