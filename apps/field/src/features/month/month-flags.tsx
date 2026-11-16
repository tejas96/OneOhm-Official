import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { type Href, router } from 'expo-router';
import { ChevronRight, CircleCheck, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { MONTH } from '@/copy/month';
import { dayList } from './month-format';

type Flag = MonthSheetPerson['row']['flags'][number];
type Action = { readonly label: string; readonly run: (days: readonly string[]) => void };

/** Informational for the worker; where a field screen fixes it, one tap goes there. */
export function MonthFlags({
  flags,
  onFixTimes,
}: {
  readonly flags: readonly Flag[];
  readonly onFixTimes: (date: string) => void;
}) {
  const theme = useTheme();
  const go = (href: Href) => () => router.push(href);
  const fixTimes: Action = {
    label: MONTH.actions.fixTimes,
    run: ([first]) => first && onFixTimes(first),
  };
  const actions: Partial<Record<Flag['kind'], Action[]>> = {
    auto_closed: [fixTimes],
    absent_no_reason: [fixTimes, { label: MONTH.actions.askLeave, run: go('/leave/new') }],
    pending_leave: [{ label: MONTH.actions.leave, run: go('/leave') }],
    pending_travel: [{ label: MONTH.actions.travel, run: go('/travel') }],
    open_alert: [{ label: MONTH.actions.alerts, run: go('/alerts') }],
  };
  if (flags.length === 0) {
    return (
      <Card tone="sunken" style={styles.clean}>
        <CircleCheck size={18} color={theme.status.onTrack.solid} />
        <Text variant="body" tone="secondary" style={styles.flex}>
          {MONTH.nothingToCheck}
        </Text>
      </Card>
    );
  }
  return (
    <Card style={styles.card}>
      {flags.map((flag) => (
        <View key={flag.kind} style={styles.flag}>
          <TriangleAlert size={18} color={theme.status.atRisk.solid} style={styles.icon} />
          <View style={styles.flex}>
            <Text variant="body">{MONTH.flags[flag.kind](flag.days.length)}</Text>
            <Text variant="label" tone="tertiary">
              {dayList(flag.days, MONTH.more)}
            </Text>
            <View style={styles.actions}>
              {(actions[flag.kind] ?? []).map((action) => (
                <PressableScale
                  key={action.label}
                  accessibilityRole="button"
                  onPress={() => action.run(flag.days)}
                  style={styles.link}
                >
                  <Text variant="label" tone="accent">
                    {action.label}
                  </Text>
                  <ChevronRight size={14} color={theme.colors.accent} />
                </PressableScale>
              ))}
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16 },
  clean: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  flag: { flexDirection: 'row', gap: 10 },
  icon: { marginTop: 2 },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, paddingTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6 },
});
