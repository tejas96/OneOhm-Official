import type { NotificationItem } from '@oneohm/api-contracts';
import { Bell } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

/** A round bell with the number of unread alerts. */
export function BellButton({
  unread,
  label,
  onPress,
}: {
  readonly unread: number;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.bell,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
      ]}
    >
      <Bell size={20} color={theme.colors.textPrimary} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
          <Text variant="label" color={theme.colors.onAccent} style={styles.badgeText}>
            {unread > 9 ? '9+' : String(unread)}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/** One alert in the inbox: unread ones carry a dot and stronger text. */
export function AlertRow({
  item,
  time,
  onPress,
}: {
  readonly item: NotificationItem;
  readonly time: string;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.colors.borderSubtle }]}
    >
      <View
        style={[styles.dot, { backgroundColor: item.read ? 'transparent' : theme.colors.accent }]}
      />
      <View style={styles.words}>
        <Text variant="titleMd" tone={item.read ? 'secondary' : 'primary'}>
          {item.title}
        </Text>
        <Text variant="bodySm" tone="secondary">
          {item.body}
        </Text>
        <Text variant="label" tone="tertiary">
          {time}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 14 },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  words: { flex: 1, gap: 3 },
});
