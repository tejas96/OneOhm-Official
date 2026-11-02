import { Button } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { CHATS } from '@/copy/chats';
import { ChatRow } from './chat-row';
import { useMyChats } from './use-chats';

/** Customers waiting for this person's answer on WhatsApp; nothing when nobody waits. */
export function ChatsSection() {
  const waiting = (useMyChats().data ?? []).filter((chat) => chat.needsReply);
  if (waiting.length === 0) return null;
  return (
    <View style={styles.group}>
      <SectionTitle title={CHATS.sectionTitle} count={waiting.length} />
      {waiting.map((chat) => (
        <ChatRow key={chat.id} chat={chat} />
      ))}
      <Button
        label={CHATS.seeAll}
        variant="quiet"
        size="sm"
        onPress={() => router.push('/chats')}
      />
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: 10 } });
