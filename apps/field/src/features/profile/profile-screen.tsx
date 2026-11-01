import { Button, Card, Screen, Text, useTheme } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { API_BASE_URL } from '@/api/api';
import { initials } from '@/components/initials';
import { PROFILE } from '@/copy/common';
import { LocationSharingCard } from '@/features/attendance/location-sharing-card';
import { useCurrentUser, useSession } from '@/session/session-provider';

/** Who is signed in, their roles, and sign out. */
export function ProfileScreen() {
  const theme = useTheme();
  const user = useCurrentUser();
  const { signOut } = useSession();
  const [leaving, setLeaving] = useState(false);
  const rows: { label: string; value: string | null }[] = [
    { label: PROFILE.phone, value: user.phone },
    { label: PROFILE.email, value: user.email },
    { label: PROFILE.server, value: API_BASE_URL.replace(/^https?:\/\//, '') },
  ];
  const shown = rows.filter((row): row is { label: string; value: string } => Boolean(row.value));

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
          <Text variant="displayMd" color={theme.colors.onAccentSoft}>
            {initials(user.fullName)}
          </Text>
        </View>
        <Text variant="displayLg" align="center">
          {user.fullName}
        </Text>
        <Text variant="overline" tone="tertiary" align="center">
          {PROFILE.kind[user.kind]}
        </Text>
      </View>
      <LocationSharingCard />
      <Card style={styles.card}>
        <Text variant="label" tone="tertiary">
          {PROFILE.roles}
        </Text>
        {user.roles.length === 0 ? (
          <Text variant="body" tone="secondary">
            {PROFILE.noRoles}
          </Text>
        ) : (
          <View style={styles.roles}>
            {user.roles.map((role) => (
              <View
                key={role.id}
                style={[styles.role, { backgroundColor: theme.colors.surfaceSunken }]}
              >
                <Text variant="label">{role.name}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
      <Card style={styles.card}>
        {shown.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text variant="label" tone="tertiary">
              {row.label}
            </Text>
            <Text variant="body" numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        ))}
      </Card>
      <Button
        label={PROFILE.signOut}
        variant="danger"
        pending={leaving}
        accessibilityHint={PROFILE.signOutHint}
        onPress={async () => {
          setLeaving(true);
          await signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, paddingTop: 24 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: 12 },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  role: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  row: { gap: 2 },
});
