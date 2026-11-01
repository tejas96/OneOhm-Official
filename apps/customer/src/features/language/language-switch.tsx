import { CUSTOMER_LANGUAGES, type CustomerLanguage, LANGUAGE_NAMES } from '@oneohm/domain';
import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { useLanguage } from '@/i18n/language';

/**
 * English · मराठी · हिंदी as one small pill, each name in its own script so anyone can
 * find theirs. Used where space is tight (over the sunrise on the sign-in screen).
 */
export function LanguageSwitch({
  label,
  onChange,
}: {
  readonly label: string;
  readonly onChange: (language: CustomerLanguage) => void;
}) {
  const theme = useTheme();
  const current = useLanguage();
  const { colors } = theme;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle },
      ]}
    >
      {CUSTOMER_LANGUAGES.map((language) => {
        const selected = language === current;
        return (
          <PressableScale
            key={language}
            accessibilityRole="radio"
            accessibilityLabel={LANGUAGE_NAMES[language]}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!selected) onChange(language);
            }}
            style={[styles.item, selected && { backgroundColor: colors.surfaceRaised }]}
          >
            <Text
              variant="label"
              color={selected ? colors.textPrimary : colors.textSecondary}
              numberOfLines={1}
            >
              {LANGUAGE_NAMES[language]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
  },
  item: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
});
