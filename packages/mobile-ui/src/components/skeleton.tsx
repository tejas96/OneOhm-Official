import { RADIUS } from '@oneohm/design-system/tokens';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../theme/reduced-motion';
import { useTheme } from '../theme/theme';

const HEIGHTS = [72, 56, 72] as const;

/**
 * A calm placeholder of rows while a screen loads for the first time (PRD 9.3): the
 * shape of what is coming, with a slow breathing tint. Still when motion is reduced.
 */
export function SkeletonRows({
  label,
  rows = 3,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 900,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <View style={styles.list} accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, index) => (
        <Animated.View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholder rows never reorder.
          key={index}
          style={[
            styles.row,
            {
              height: HEIGHTS[index % HEIGHTS.length],
              backgroundColor: theme.colors.surfaceSunken,
              opacity: pulse,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, paddingVertical: 8 },
  row: { borderRadius: RADIUS.lg, width: '100%' },
});
