import type { ChatSummary } from '@oneohm/api-contracts';
import { Card, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { CHATS } from '@/copy/chats';
import { shortMoment } from '@/lib/dates';

/** One line of a WhatsApp message: no line breaks, no *bold* markers. */
export const plainLine = (body: string) =>
  body
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** One chat: who, their last message, and whether they are waiting for an answer. */
export function ChatRow({ chat }: { readonly chat: ChatSummary }) {
  const theme = useTheme();
  const last = chat.lastMessage;
  return (
    <Card
      onPress={() => router.push({ pathname: '/chats/[id]', params: { id: chat.id } })}
      accessibilityLabel={chat.name}
      style={styles.card}
    >
      <View style={styles.top}>
        <Text variant="titleMd" numberOfLines={1} style={styles.flex}>
          {chat.name}
        </Text>
        {last ? (
          <Text variant="label" tone="tertiary">
            {shortMoment(last.at)}
          </Text>
        ) : null}
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
      <Text variant="bodySm" tone="secondary" numberOfLines={2}>
        {last
          ? `${last.direction === 'out' ? `${CHATS.you}: ` : ''}${plainLine(last.body)}`
          : CHATS.noMessages}
      </Text>
      {chat.needsReply ? (
        <View style={styles.bottom}>
          <StatusPill size="sm" tone="atRisk" label={CHATS.needsReply} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  bottom: { flexDirection: 'row', paddingTop: 4 },
});
