import { SunMoon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import {
  THEME_PREFERENCES,
  type ThemePreference,
  useTheme,
  useThemePreference,
} from '../theme/theme';
import { Card } from './card';
import { ChoiceChips } from './choice-chips';
import { Text } from './text';

export interface AppearanceWords {
  readonly title: string;
  readonly hint: string;
  readonly options: Readonly<Record<ThemePreference, string>>;
}

/** Light, dark or follow the phone: switches at once and is kept on this phone. */
export function AppearanceCard({ words }: { readonly words: AppearanceWords }) {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
          <SunMoon size={18} color={theme.colors.onAccentSoft} />
        </View>
        <Text variant="titleMd">{words.title}</Text>
      </View>
      <ChoiceChips
        kind="segmented"
        label={words.title}
        choices={THEME_PREFERENCES.map((value) => ({ value, label: words.options[value] }))}
        value={preference}
        onChange={setPreference}
      />
      <Text variant="bodySm" tone="secondary">
        {words.hint}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
