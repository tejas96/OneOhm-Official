import { CUSTOMER_LANGUAGES, type CustomerLanguage, LANGUAGE_NAMES } from '@oneohm/domain';
import { Card, ChoiceChips, Text, useTheme } from '@oneohm/mobile-ui';
import { Languages } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { PROFILE } from '@/copy/common';
import { chooseSignedIn } from '@/i18n/account-language';
import { useLanguage } from '@/i18n/language';
import { useCustomer } from '@/session/session-provider';

const CHOICES = CUSTOMER_LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }));

/** The app's language in Me: switches at once and is saved on the customer record. */
export function LanguageCard() {
  const theme = useTheme();
  const customer = useCustomer();
  const language = useLanguage();
  const toast = useToast();
  const choose = (next: CustomerLanguage) => {
    void chooseSignedIn(next, Boolean(customer.viewer)).then((saved) => {
      if (!saved) toast(PROFILE.languageNotSaved);
    });
  };
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
          <Languages size={18} color={theme.colors.onAccentSoft} />
        </View>
        <Text variant="titleMd">{PROFILE.language}</Text>
      </View>
      <ChoiceChips
        kind="segmented"
        label={PROFILE.language}
        choices={CHOICES}
        value={language}
        onChange={(next) => {
          if (next !== language) choose(next);
        }}
      />
      <Text variant="bodySm" tone="secondary">
        {PROFILE.languageHint}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
