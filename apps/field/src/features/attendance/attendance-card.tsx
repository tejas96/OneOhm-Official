import type { MyWorkday } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { Route } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TRAVEL } from '@/copy/site';
import { ATTENDANCE } from '@/copy/workforce';
import { TrackingStatus } from '@/features/site/tracking-status';
import { DutySection } from '../duty/duty-section';
import { ConsentPrompt } from './consent-prompt';
import { onCorrectionRequest } from './correction-request';
import { CorrectionSheet } from './correction-sheet';
import { DayActions } from './day-actions';
import { DayLine } from './day-line';

/** Today's check-in and check-out and where they happened; points sit in their own tile. */
export function AttendanceCard({ workday }: { readonly workday: MyWorkday }) {
  const theme = useTheme();
  const [correcting, setCorrecting] = useState<{ readonly date: string | null } | null>(null);
  const fix = (date: string | null) => setCorrecting({ date });
  useEffect(() => onCorrectionRequest((date) => setCorrecting({ date })), []);
  const day = workday.today;
  const askConsent = workday.attendance.captureLocation && !workday.consent.answered;
  // Agreed to older words: asked again even in the middle of a day, as the route needs the new ones.
  const stale = !workday.consent.given && workday.consent.version !== null;
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
      {workday.tracking ? (
        <View style={styles.status}>
          <TrackingStatus state={workday.tracking} />
        </View>
      ) : null}
      {askConsent && (!day || stale) ? (
        <ConsentPrompt days={workday.attendance.retentionDays} stale={stale} />
      ) : null}
      <DutySection workday={workday} />
      <DayActions workday={workday} onFix={fix} />
      <View style={styles.foot}>
        <PressableScale accessibilityRole="button" onPress={() => fix(null)}>
          <Text variant="label" tone="accent">
            {ATTENDANCE.correction}
          </Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          onPress={() => router.push('/travel')}
          style={styles.place}
        >
          <Route size={14} color={theme.colors.accent} />
          <Text variant="label" tone="accent">
            {TRAVEL.link}
          </Text>
        </PressableScale>
      </View>
      <CorrectionSheet
        open={correcting !== null}
        initialDate={correcting?.date ?? null}
        windowDays={workday.attendance.correctionWindowDays ?? 31}
        onClose={() => setCorrecting(null)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foot: { gap: 8, paddingTop: 4 },
  status: { flexDirection: 'row' },
});
