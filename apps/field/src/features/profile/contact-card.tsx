import { Button, Card, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Phone } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { CONTACT } from '@/copy/engagement';

/** Digits only, with India's code, for tel: and wa.me links. */
function dialDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/**
 * Support for resellers (PRD 4.8): call or WhatsApp the office number from the company
 * profile. No email.
 */
export function ContactCard() {
  const theme = useTheme();
  const company = useQuery({
    queryKey: ['company'],
    queryFn: () => unwrap(api.catalog.getCompany()),
  });
  const phone = company.data?.phones.find((value) => value.trim().length > 0) ?? null;
  const brand = company.data?.brandName;
  if (company.isPending) return null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {(brand ? CONTACT.title(brand) : CONTACT.titleOffice).toUpperCase()}
      </Text>
      <Text variant="body" tone="secondary">
        {phone ? CONTACT.body : CONTACT.noNumber}
      </Text>
      {phone ? (
        <View style={styles.actions}>
          <Button
            label={CONTACT.call}
            variant="secondary"
            size="sm"
            icon={<Phone size={16} color={theme.colors.textPrimary} />}
            onPress={() => void Linking.openURL(`tel:+${dialDigits(phone)}`)}
            style={styles.fill}
          />
          <Button
            label={CONTACT.whatsapp}
            variant="secondary"
            size="sm"
            icon={<MessageCircle size={16} color={theme.colors.textPrimary} />}
            onPress={() => void Linking.openURL(`https://wa.me/${dialDigits(phone)}`)}
            style={styles.fill}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  fill: { flex: 1 },
});
