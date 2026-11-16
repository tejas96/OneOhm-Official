import type { MonthSheetPerson } from '@oneohm/api-contracts';
import {
  describeError,
  ErrorState,
  LoadingState,
  PressableScale,
  Screen,
  StatusPill,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader, SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { MONTH } from '@/copy/month';
import { CorrectionSheet } from '@/features/attendance/correction-sheet';
import { businessToday, shortMoment } from '@/lib/dates';
import { DayDetail } from './day-detail';
import { MonthCalendar, MonthLegend } from './month-calendar';
import { MonthFlags } from './month-flags';
import { canGoNext, monthOf, monthTitle, shiftMonth } from './month-format';
import { MonthNumbers, PayableHero } from './month-numbers';
import { useMyMonth } from './use-my-month';

function FinalBanner({ sheet }: { readonly sheet: MonthSheetPerson }) {
  if (sheet.lock.status !== 'locked') return null;
  return (
    <View style={styles.final}>
      <StatusPill tone="onTrack" label={MONTH.final} />
      <Text variant="label" tone="secondary" style={styles.title}>
        {MONTH.lockedOn(sheet.lock.lockedAt ? shortMoment(sheet.lock.lockedAt) : '')}
      </Text>
    </View>
  );
}

/** The person's month the way HR sees it: calendar, counts, travel, pay and what to check. */
export function MonthScreen() {
  const theme = useTheme();
  const today = businessToday();
  // A month sheet alert opens the month it is about.
  const asked = useLocalSearchParams<{ month?: string }>().month;
  const [month, setMonth] = useState(asked && /^\d{4}-\d{2}$/.test(asked) ? asked : monthOf(today));
  const [picked, setPicked] = useState<string | null>(null);
  const [fixDate, setFixDate] = useState<string | null>(null);
  const query = useMyMonth(month);
  const sheet = query.data?.lock.month === month ? query.data : undefined;
  const move = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setPicked(null);
  };
  const selected = picked ?? (sheet?.days.some((d) => d.date === today) ? today : null);
  const day = sheet?.days.find((d) => d.date === selected);
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <ScreenHeader overline={MONTH.overline} title={MONTH.title} />
      <View style={styles.switcher}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={MONTH.prev}
          onPress={() => move(-1)}
          style={[styles.arrow, { borderColor: theme.colors.borderSubtle }]}
        >
          <ChevronLeft size={20} color={theme.colors.textPrimary} />
        </PressableScale>
        <Text variant="titleMd" style={styles.title}>
          {monthTitle(month)}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={MONTH.next}
          disabled={!canGoNext(month, today)}
          onPress={() => move(1)}
          style={[
            styles.arrow,
            { borderColor: theme.colors.borderSubtle, opacity: canGoNext(month, today) ? 1 : 0.3 },
          ]}
        >
          <ChevronRight size={20} color={theme.colors.textPrimary} />
        </PressableScale>
      </View>
      {query.isPending || (query.isPlaceholderData && !sheet) ? (
        <LoadingState label={MONTH.loading} />
      ) : null}
      {query.isError ? (
        <ErrorState
          title={MONTH.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {sheet ? (
        <>
          <FinalBanner sheet={sheet} />
          {sheet.row.changes.length > 0 ? (
            <Text variant="label" color={theme.status.atRisk.fg}>
              {MONTH.changedAfterLock}
            </Text>
          ) : null}
          <PayableHero sheet={sheet} />
          <View style={styles.block}>
            <MonthCalendar
              days={sheet.days}
              today={today}
              selected={selected}
              onSelect={setPicked}
            />
            <MonthLegend days={sheet.days} />
            {day ? (
              <DayDetail day={day} />
            ) : (
              <Text variant="label" tone="tertiary">
                {MONTH.tapDay}
              </Text>
            )}
          </View>
          <View style={styles.block}>
            <SectionTitle title={MONTH.sections.days} />
            <MonthNumbers sheet={sheet} />
          </View>
          {sheet.lock.status === 'open' ? (
            <View style={styles.block}>
              <SectionTitle title={MONTH.sections.check} count={sheet.row.flags.length} />
              <MonthFlags flags={sheet.row.flags} onFixTimes={setFixDate} />
            </View>
          ) : null}
        </>
      ) : null}
      <CorrectionSheet
        open={fixDate !== null}
        onClose={() => setFixDate(null)}
        initialDate={fixDate}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, textAlign: 'center' },
  final: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { gap: 10 },
});
