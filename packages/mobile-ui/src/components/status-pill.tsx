import { RADIUS } from '@oneohm/design-system/tokens';
import { StyleSheet, View } from 'react-native';
import { type Tone, useTheme } from '../theme/theme';
import { Text } from './text';

/** Status in a word and a colour, never colour alone. */
export function StatusPill({
  tone,
  label,
  size = 'md',
}: {
  readonly tone: Tone;
  readonly label: string;
  readonly size?: 'sm' | 'md';
}) {
  const color = useTheme().status[tone];
  return (
    <View
      style={[styles.pill, { backgroundColor: color.tint }, size === 'sm' ? styles.small : null]}
      accessibilityLabel={label}
    >
      <View style={[styles.dot, { backgroundColor: color.solid }]} />
      <Text variant="label" color={color.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A small count bubble (tabs, section headers). */
export function CountBadge({
  count,
  tone = 'neutral',
}: {
  readonly count: number;
  readonly tone?: Tone;
}) {
  const theme = useTheme();
  const color = theme.status[tone];
  return (
    <View
      style={[
        styles.count,
        { backgroundColor: tone === 'neutral' ? theme.colors.textPrimary : color.solid },
      ]}
    >
      <Text variant="mono" color={theme.colors.canvas}>
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  small: { paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
