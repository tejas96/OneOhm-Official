import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { Calculator, CalendarPlus, UserPlus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { QUICK_LEAVE } from '@/copy/engagement';
import { TODAY } from '@/copy/tasks';
import { useCan } from '@/session/session-provider';

/** Role-specific shortcuts; crews without sales or leave rights see none. */
export function QuickActions() {
  const canLead = useCan('leads.manage');
  const canQuote = useCan('quotations.create');
  const canLeave = useCan('leave.request');
  if (!canLead && !canQuote && !canLeave) return null;
  return (
    <View style={styles.row}>
      {canLead ? (
        <Action
          label={TODAY.quick.newLead}
          onPress={() => router.push('/leads/new')}
          icon={UserPlus}
        />
      ) : null}
      {canQuote ? (
        <Action label={TODAY.quick.quote} onPress={() => router.push('/quote')} icon={Calculator} />
      ) : null}
      {canLeave ? (
        <Action label={QUICK_LEAVE} onPress={() => router.push('/leave/new')} icon={CalendarPlus} />
      ) : null}
    </View>
  );
}

function Action({
  label,
  onPress,
  icon: Icon,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon: (props: { size: number; color: string }) => ReactNode;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.action,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
        <Icon size={18} color={theme.colors.onAccentSoft} />
      </View>
      <Text variant="titleMd">{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
