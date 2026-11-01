import type { Announcement } from '@oneohm/api-contracts';
import { Card, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { ANNOUNCEMENTS } from '@/copy/engagement';
import { shortDate, shortMoment } from '@/lib/dates';

export const announcementKeys = { mine: ['me', 'announcements'] as const };

/** Notices from the owners or HR showing now (PRD 4.1); nothing when there are none. */
export function AnnouncementsCard() {
  const query = useQuery({
    queryKey: announcementKeys.mine,
    queryFn: () => unwrap(api.engagement.myAnnouncements()),
  });
  const items = query.data ?? [];
  if (items.length === 0) return null;
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <AnnouncementItem key={item.id} item={item} />
      ))}
    </View>
  );
}

function AnnouncementItem({ item }: { readonly item: Announcement }) {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
          <Megaphone size={16} color={theme.colors.onAccentSoft} />
        </View>
        <Text variant="overline" tone="tertiary">
          {ANNOUNCEMENTS.overline}
        </Text>
      </View>
      <Text variant="titleMd">{item.title}</Text>
      <Text variant="body" tone="secondary">
        {item.body}
      </Text>
      <Text variant="label" tone="tertiary">
        {ANNOUNCEMENTS.posted(item.createdBy?.fullName ?? null, shortMoment(item.createdAt))}
        {item.endsOn ? ` · ${ANNOUNCEMENTS.until(shortDate(item.endsOn))}` : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
