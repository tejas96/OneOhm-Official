import { PressableScale, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { SEARCH } from '@/copy/search';

/** A round search button beside the bell; opens Search. */
export function SearchButton() {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={SEARCH.open}
      onPress={() => router.push('/search')}
      style={[
        styles.button,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
      ]}
    >
      <Search size={20} color={theme.colors.textPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
