import { Button, Card, Screen, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { Mail, Phone, Star, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { API_BASE_URL } from '@/api/api';
import { FEEDBACK, REFER } from '@/copy/care';
import { PROFILE } from '@/copy/common';
import { FAMILY } from '@/copy/family';
import { CoverCard } from '@/features/help/cover-card';
import { useChosenProject, useHome } from '@/features/home/use-home';
import { LanguageCard } from '@/features/language/language-card';
import { dialDigits } from '@/lib/journey';
import { useCustomer, useSession } from '@/session/session-provider';
import { ReferralList } from './refer-screen';

/** The customer's details, referrals, a rating, OneOhm's contacts and sign-out. */
export function ProfileScreen() {
  const theme = useTheme();
  const customer = useCustomer();
  const { signOut } = useSession();
  const home = useHome();
  const company = home.data?.company;
  const { project } = useChosenProject(home.data?.projects);
  const [leaving, setLeaving] = useState(false);
  const icon = theme.colors.textPrimary;

  return (
    <Screen>
      <Text variant="displayLg" style={styles.title}>
        {PROFILE.title}
      </Text>
      <Card style={styles.card}>
        <Text variant="titleLg">{customer.name}</Text>
        <Row
          label={PROFILE.phone}
          value={customer.phone.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2')}
        />
        {customer.email ? <Row label={PROFILE.email} value={customer.email} /> : null}
      </Card>

      <LanguageCard />

      <CoverCard projectId={project?.id ?? null} />

      <Card tone="sunken" style={styles.card}>
        <Text variant="titleMd">{PROFILE.refer}</Text>
        <Text variant="bodySm" tone="secondary">
          {PROFILE.referHint}
        </Text>
        <Button
          label={REFER.submit}
          variant="secondary"
          icon={<UserPlus size={16} color={icon} />}
          onPress={() => router.push('/refer')}
        />
        <ReferralList />
      </Card>

      <Card tone="sunken" style={styles.card}>
        <Text variant="titleMd">{FAMILY.cardTitle}</Text>
        <Text variant="bodySm" tone="secondary">
          {FAMILY.cardHint}
        </Text>
        <Button
          label={FAMILY.open}
          variant="secondary"
          icon={<Users size={16} color={icon} />}
          onPress={() => router.push('/family')}
        />
      </Card>

      {project ? (
        <Card style={styles.card}>
          <Text variant="titleMd">{FEEDBACK.title}</Text>
          <Text variant="bodySm" tone="secondary">
            {FEEDBACK.intro}
          </Text>
          <Button
            label={FEEDBACK.submit}
            variant="secondary"
            icon={<Star size={16} color={icon} />}
            onPress={() =>
              router.push({ pathname: '/feedback/[projectId]', params: { projectId: project.id } })
            }
          />
        </Card>
      ) : null}

      {company ? (
        <Card style={styles.card}>
          <Text variant="titleMd">{company.name}</Text>
          <View style={styles.actions}>
            {company.phones[0] ? (
              <Button
                label={PROFILE.call}
                variant="secondary"
                size="sm"
                icon={<Phone size={16} color={icon} />}
                onPress={() => void Linking.openURL(`tel:+${dialDigits(company.phones[0] ?? '')}`)}
              />
            ) : null}
            {company.email ? (
              <Button
                label={PROFILE.mail}
                variant="secondary"
                size="sm"
                icon={<Mail size={16} color={icon} />}
                onPress={() => void Linking.openURL(`mailto:${company.email}`)}
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      <View style={styles.signOut}>
        <Button
          label={PROFILE.signOut}
          variant="danger"
          pending={leaving}
          onPress={() => {
            setLeaving(true);
            void signOut().finally(() => setLeaving(false));
          }}
          fullWidth
        />
        <Text variant="label" tone="tertiary" style={styles.center}>
          {PROFILE.signOutHint}
        </Text>
        {__DEV__ ? (
          <Text variant="label" tone="tertiary" style={styles.center}>
            {`${PROFILE.server} ${API_BASE_URL}`}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" tone="tertiary">
        {label}
      </Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: 8 },
  card: { gap: 10 },
  row: { gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signOut: { gap: 8, paddingTop: 8 },
  center: { textAlign: 'center' },
});
