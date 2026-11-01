import { PressableScale, useTheme } from '@oneohm/mobile-ui';
import { Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

/** One to five stars; tapping a star sets the rating. */
export function StarRow({
  value,
  onChange,
  labels,
  size = 32,
}: {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly labels: readonly string[];
  readonly size?: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.stars} accessibilityRole="radiogroup">
      {labels.map((label, index) => {
        const star = index + 1;
        const on = star <= value;
        return (
          <PressableScale
            key={label}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: star === value }}
            onPress={() => onChange(star)}
            style={styles.star}
          >
            <Star
              size={size}
              color={on ? theme.colors.energy : theme.colors.textTertiary}
              fill={on ? theme.colors.energy : 'transparent'}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 2 },
  star: { padding: 5 },
});
