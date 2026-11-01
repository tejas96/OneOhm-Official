import { Text, useTheme } from '@oneohm/mobile-ui';
import { View } from 'react-native';

/** "Asha Kale" → "AK": the first letter of the first two words. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** A soft circle with a person's initials. */
export function InitialsBadge({
  name,
  size = 32,
}: {
  readonly name: string;
  readonly size?: number;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft,
      }}
    >
      <Text variant="label" color={theme.colors.onAccentSoft}>
        {initials(name)}
      </Text>
    </View>
  );
}
