import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';

/** Back button, an overline (code or kind) and the screen title in the display face. */
export function ScreenHeader({
  overline,
  title,
  trailing,
}: {
  readonly overline?: string | undefined;
  readonly title: string;
  readonly trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={COMMON.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[
            styles.back,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
          ]}
        >
          <ChevronLeft size={20} color={theme.colors.textPrimary} />
        </PressableScale>
        {trailing}
      </View>
      {overline ? (
        <Text variant="mono" tone="tertiary">
          {overline}
        </Text>
      ) : null}
      <Text variant="displayLg">{title}</Text>
    </View>
  );
}

/** A section title with an optional count. */
export function SectionTitle({
  title,
  count,
}: {
  readonly title: string;
  readonly count?: number;
}) {
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="tertiary">
        {title}
      </Text>
      {count !== undefined ? (
        <Text variant="mono" tone="tertiary">
          {count}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
