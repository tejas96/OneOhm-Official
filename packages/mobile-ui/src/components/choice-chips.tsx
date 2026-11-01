import { RADIUS } from '@oneohm/design-system/tokens';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { PressableScale } from './pressable-scale';
import { Text } from './text';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface ChoiceChipsProps<T extends string> {
  readonly choices: readonly Choice<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly label: string;
  /** Segmented: equal-width tabs in one track. Chips: a scrollable row. */
  readonly kind?: 'chips' | 'segmented';
}

/** Pick one of a few options: a segmented track or a row of chips. */
export function ChoiceChips<T extends string>({
  choices,
  value,
  onChange,
  label,
  kind = 'chips',
}: ChoiceChipsProps<T>) {
  const theme = useTheme();
  const { colors } = theme;
  const items = choices.map((choice) => {
    const selected = choice.value === value;
    const segmented = kind === 'segmented';
    return (
      <PressableScale
        key={choice.value}
        accessibilityRole={segmented ? 'tab' : 'radio'}
        accessibilityState={{ selected, checked: selected }}
        accessibilityLabel={choice.label}
        onPress={() => onChange(choice.value)}
        style={chipStyle(colors, segmented, selected)}
      >
        <Text variant="label" color={labelColor(colors, segmented, selected)} numberOfLines={1}>
          {choice.label}
        </Text>
      </PressableScale>
    );
  });
  if (kind === 'segmented') {
    return (
      <View
        accessibilityRole="tablist"
        accessibilityLabel={label}
        style={[styles.track, { backgroundColor: colors.surfaceSunken }]}
      >
        {items}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
    >
      {items}
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

function labelColor(colors: Colors, segmented: boolean, selected: boolean): string {
  if (segmented) return selected ? colors.textPrimary : colors.textSecondary;
  return selected ? colors.canvas : colors.textPrimary;
}

function chipStyle(colors: Colors, segmented: boolean, selected: boolean) {
  if (segmented) {
    return [
      styles.segment,
      { backgroundColor: selected ? colors.surfaceRaised : 'transparent' },
      selected ? styles.segmentLift : null,
    ];
  }
  return [
    styles.chip,
    {
      backgroundColor: selected ? colors.textPrimary : colors.surfaceRaised,
      borderColor: selected ? colors.textPrimary : colors.borderStrong,
    },
  ];
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  track: { flexDirection: 'row', borderRadius: RADIUS.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    paddingVertical: 9,
  },
  segmentLift: {
    shadowColor: '#14171A',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
