import type { MyWorkday } from '@oneohm/api-contracts';
import { Button, Card, describeError, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { LogIn, LogOut, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { ATTENDANCE, POINTS } from '@/copy/workforce';
import { ConsentPrompt } from './consent-prompt';
import { CorrectionSheet } from './correction-sheet';
import { DayLine } from './day-line';
import { useAttendanceAction } from './use-workday';

/** Today's check-in and check-out, where they happened, and this month's points. */
export function AttendanceCard({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  const toast = useToast();
  const [correcting, setCorrecting] = useState(false);
  const day = workday.today;
  const action = useAttendanceAction(day ? 'out' : 'in', workday);
  const askConsent = workday.attendance.captureLocation && !workday.consent.answered;
  const run = () =>
    action.mutate(undefined, {
      onSuccess: ({ missed }) => {
        if (missed === 'denied') toast(ATTENDANCE.permissionDenied);
        if (missed === 'nofix') toast(ATTENDANCE.noFix);
      },
      onError: (error) => toast(describeError(error)),
    });
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="overline" tone="tertiary">
          {ATTENDANCE.title.toUpperCase()}
        </Text>
        <Text variant="label" tone="tertiary">
          {ATTENDANCE.hours(workday.attendance.dayStart, workday.attendance.dayEnd)}
        </Text>
      </View>
      <DayLine workday={workday} />
      {askConsent && !day ? <ConsentPrompt days={workday.attendance.retentionDays} /> : null}
      {day?.checkOutAt ? (
        <Text variant="bodySm" tone="secondary">
          {ATTENDANCE.dayDone}
        </Text>
      ) : (
        <Button
          label={day ? ATTENDANCE.checkOut : ATTENDANCE.checkIn}
          variant={day ? 'secondary' : 'primary'}
          icon={
            day ? (
              <LogOut size={18} color={theme.colors.textPrimary} />
            ) : (
              <LogIn size={18} color={theme.colors.onAccent} />
            )
          }
          pending={action.isPending}
          onPress={run}
          fullWidth
        />
      )}
      <View style={styles.foot}>
        <View style={styles.place}>
          <Sparkles size={14} color={theme.colors.accent} />
          <Text variant="label" tone="secondary">
            {POINTS.thisMonth(workday.points.thisMonth)} · {POINTS.total(workday.points.total)}
          </Text>
        </View>
        <PressableScale accessibilityRole="button" onPress={() => setCorrecting(true)}>
          <Text variant="label" tone="accent">
            {ATTENDANCE.correction}
          </Text>
        </PressableScale>
      </View>
      <CorrectionSheet open={correcting} onClose={() => setCorrecting(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foot: { gap: 8, paddingTop: 4 },
});
