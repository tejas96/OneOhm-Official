import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronRight, MessageCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { CHATS } from '@/copy/chats';
import { useMyChats } from './use-chats';

/** A quiet way back to past chats once nobody is waiting; hidden for people with none. */
export function ChatsLink() {
  const theme = useTheme();
  const count = useMyChats().data?.length ?? 0;
  if (count === 0) return null;
  return (
    <Card
      onPress={() => router.push('/chats')}
      accessibilityLabel={CHATS.title}
      style={styles.card}
    >
      <View style={styles.row}>
        <MessageCircle size={18} color={theme.colors.accent} />
        <Text variant="body" style={styles.flex}>
          {CHATS.title}
        </Text>
        <Text variant="mono" tone="tertiary">
          {count}
        </Text>
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
});
