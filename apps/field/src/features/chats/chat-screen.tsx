import type { ChatDetail, ChatMessage } from '@oneohm/api-contracts';
import { FOLLOW_UP_MAX } from '@oneohm/domain';
import {
  Button,
  describeError,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useLocalSearchParams } from 'expo-router';
import { Clock3, Phone, SendHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Linking, StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { CHATS } from '@/copy/chats';
import { COMMON } from '@/copy/common';
import { shortMoment } from '@/lib/dates';
import { useChat, useHandBack, useSendReply } from './use-chats';

/** One WhatsApp chat from the business number: read it and answer, from the app. */
export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useChat(id);
  if (query.isPending)
    return (
      <Screen>
        <LoadingState label={CHATS.loadingChat} />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen>
        <ScreenHeader title={CHATS.title} />
        <ErrorState
          title={CHATS.notFound}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  return <ChatView detail={query.data} />;
}

function ChatView({ detail }: { readonly detail: ChatDetail }) {
  const theme = useTheme();
  const { chat, messages } = detail;
  const handBack = useHandBack(chat.id);
  // Newest at the bottom, like WhatsApp: an inverted list opens at the latest message.
  const newestFirst = [...messages].reverse();
  return (
    <Screen footer={<ReplyBar detail={detail} />} scroll={false}>
      <ScreenHeader
        overline={formatPhone(chat.phone)}
        title={chat.name}
        trailing={
          <Button
            label={CHATS.call}
            variant="secondary"
            size="sm"
            icon={<Phone size={16} color={theme.colors.textPrimary} />}
            onPress={() => void Linking.openURL(`tel:${chat.phone}`)}
          />
        }
      />
      <FlatList
        inverted
        style={styles.flex}
        data={newestFirst}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => <Bubble message={item} />}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text variant="body" tone="secondary">
            {CHATS.noMessages}
          </Text>
        }
        // Inverted: the "header" sits under the newest message.
        ListHeaderComponent={
          chat.state === 'human' ? (
            <Button
              label={CHATS.handBack}
              variant="quiet"
              size="sm"
              pending={handBack.isPending}
              onPress={() => handBack.mutate()}
            />
          ) : undefined
        }
      />
    </Screen>
  );
}

/** "+919800000000" → "+91 98000 00000"; anything else as it is. */
function formatPhone(e164: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return match ? `+91 ${match[1]} ${match[2]}` : e164;
}

function Bubble({ message }: { readonly message: ChatMessage }) {
  const theme = useTheme();
  const out = message.direction === 'out';
  const who = out
    ? message.kind === 'template' && !message.sentBy
      ? CHATS.update
      : (message.sentBy ?? CHATS.assistant)
    : null;
  return (
    <View
      style={[
        styles.bubble,
        out
          ? { alignSelf: 'flex-end', backgroundColor: theme.colors.accentSoft }
          : { alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceRaised },
      ]}
    >
      {who ? (
        <Text variant="label" tone="tertiary">
          {who}
        </Text>
      ) : null}
      <Text variant="body">{message.body}</Text>
      <Text variant="label" tone="tertiary" style={styles.meta}>
        {shortMoment(message.at)}
        {out && message.delivery ? ` · ${CHATS.delivery[message.delivery]}` : ''}
      </Text>
    </View>
  );
}

/** The answer box; after 24 hours it says the words go as a WhatsApp update. */
function ReplyBar({ detail }: { readonly detail: ChatDetail }) {
  const theme = useTheme();
  const { chat } = detail;
  const send = useSendReply(chat.id);
  const [draft, setDraft] = useState('');
  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text, { onSuccess: () => setDraft('') });
  };
  return (
    <View style={styles.bar}>
      {!chat.windowOpen ? (
        <View style={styles.note}>
          <Clock3 size={14} color={theme.colors.textTertiary} />
          <Text variant="label" tone="secondary" style={styles.flex}>
            {CHATS.closed}
          </Text>
        </View>
      ) : chat.state !== 'human' ? (
        <Text variant="label" tone="tertiary">
          {CHATS.takeOver}
        </Text>
      ) : null}
      {send.error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {`${CHATS.sendFailed}: ${describeError(send.error)}`}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={CHATS.placeholder}
          accessibilityLabel={CHATS.placeholder}
          multiline
          maxLength={chat.windowOpen ? 4000 : FOLLOW_UP_MAX}
          style={styles.input}
        />
        <Button
          label={CHATS.send}
          icon={<SendHorizontal size={16} color={theme.colors.onAccent} />}
          pending={send.isPending}
          disabled={!draft.trim()}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: 8, paddingVertical: 8 },
  bubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  meta: { alignSelf: 'flex-end' },
  bar: { gap: 8 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, maxHeight: 120 },
  flex: { flex: 1 },
});
