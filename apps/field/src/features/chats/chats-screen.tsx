import {
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  useTheme,
} from '@oneohm/mobile-ui';
import { MessageCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { CHATS } from '@/copy/chats';
import { COMMON } from '@/copy/common';
import { ChatRow } from './chat-row';
import { useMyChats } from './use-chats';

/** Every chat this person answers; the ones waiting for an answer first. */
export function ChatsScreen() {
  const theme = useTheme();
  const query = useMyChats();
  const chats = [...(query.data ?? [])].sort(
    (a, b) =>
      Number(b.needsReply) - Number(a.needsReply) ||
      (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''),
  );
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <ScreenHeader title={CHATS.title} />
      {query.isPending ? <LoadingState label={CHATS.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && chats.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} color={theme.colors.accent} />}
          title={CHATS.empty}
        />
      ) : null}
      <View style={styles.list}>
        {chats.map((chat) => (
          <ChatRow key={chat.id} chat={chat} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: 10 } });
