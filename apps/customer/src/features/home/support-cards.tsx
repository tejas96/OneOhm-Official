import type { CustomerProject } from '@oneohm/api-contracts';
import { Button, Card, formatInr, StatusPill, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { HandCoins, MessageCircle, Phone, UsersRound } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { HOME } from '@/copy/home';
import { dialDigits } from '@/lib/journey';

const SUBSIDY_TONE = {
  pending: 'neutral',
  applied: 'waiting',
  inspected: 'review',
  released: 'done',
} as const;

/** The expected government subsidy and where it stands. */
export function SubsidyCard({ subsidy }: { readonly subsidy: CustomerProject['subsidy'] }) {
  const theme = useTheme();
  if (subsidy.status === 'not_applicable') return null;
  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <View style={[styles.icon, { backgroundColor: theme.colors.energySoft }]}>
          <HandCoins size={20} color={theme.colors.energy} />
        </View>
        <View style={styles.fill}>
          <Text variant="overline" tone="tertiary">
            {HOME.subsidyTitle.toUpperCase()}
          </Text>
          <Text variant="displayMd">{formatInr(subsidy.amountPaise)}</Text>
        </View>
        <StatusPill
          tone={SUBSIDY_TONE[subsidy.status]}
          label={HOME.subsidyStatus[subsidy.status]}
          size="sm"
        />
      </View>
      <Text variant="bodySm" tone="secondary">
        {HOME.subsidy[subsidy.status]}
      </Text>
    </Card>
  );
}

/** The person to call, with call and WhatsApp. */
export function ContactCard({ contact }: { readonly contact: CustomerProject['contact'] }) {
  const theme = useTheme();
  const name = contact?.name ?? HOME.contactFallback;
  const phone = contact?.phone ?? null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {HOME.contactTitle.toUpperCase()}
      </Text>
      <View style={styles.headRow}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
          <Text variant="titleMd" color={theme.colors.onAccentSoft}>
            {name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text variant="titleMd" style={styles.fill}>
          {name}
        </Text>
      </View>
      {phone ? (
        <View style={styles.actions}>
          <Button
            label={HOME.call}
            variant="secondary"
            size="sm"
            icon={<Phone size={16} color={theme.colors.textPrimary} />}
            onPress={() => void Linking.openURL(`tel:+${dialDigits(phone)}`)}
            style={styles.fill}
          />
          <Button
            label={HOME.whatsapp}
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

/** Refer a neighbour. */
export function ReferPrompt() {
  const theme = useTheme();
  return (
    <Card
      tone="sunken"
      style={styles.card}
      onPress={() => router.push('/refer')}
      accessibilityLabel={HOME.referAction}
    >
      <View style={styles.headRow}>
        <UsersRound size={20} color={theme.colors.accent} />
        <Text variant="titleMd" style={styles.fill}>
          {HOME.referTitle}
        </Text>
      </View>
      <Text variant="bodySm" tone="secondary">
        {HOME.referBody}
      </Text>
      <Text variant="label" tone="accent">
        {HOME.referAction} →
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  fill: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 10 },
});
