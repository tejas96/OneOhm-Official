import type { MyWorkday } from '@oneohm/api-contracts';
import { Button, describeError, Text, useTheme } from '@oneohm/mobile-ui';
import { LogIn, LogOut, RotateCcw } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { ATTENDANCE } from '@/copy/workforce';
import { confirmAction } from '@/lib/confirm';
import { businessToday, clockTime, relativeDate } from '@/lib/dates';
import { useCurrentUser } from '@/session/session-provider';
import { type DayState, dayStateOf } from './day-state';
import { locationNotice } from './location-notice';
import { lastQueued } from './tap-queue';
import { tapQueue } from './tap-sender';
import { useAttendanceAction, useResumeDuty } from './use-workday';

/**
 * The button for the day: Check in, Check out (also for a day left open from before),
 * Resume duty after an End duty the same day, and the notes that go with each (A2, A9, A10).
 * `onFix` opens the correction sheet for a day the night job ended.
 */
export function DayActions({
  workday,
  onFix,
}: {
  readonly workday: MyWorkday;
  readonly onFix: (workDate: string) => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const user = useCurrentUser();
  const queue = useSyncExternalStore(tapQueue.subscribe, () => tapQueue.mine(user.id));
  const day = workday.today;
  const state = dayStateOf(day, workday.businessDate ?? businessToday(), lastQueued(queue));
  const action = useAttendanceAction(state.kind === 'in' ? 'in' : 'out', workday);
  const send = () =>
    action.mutate(undefined, {
      onSuccess: ({ day: answered, missed, queued }) => {
        const notice = queued
          ? ATTENDANCE.queuedToast
          : locationNotice(answered?.locationResult, missed);
        if (notice) toast(notice);
      },
      onError: (error) => toast(describeError(error)),
    });
  const run = () =>
    state.kind === 'out'
      ? confirmAction({
          title: ATTENDANCE.confirmOutTitle,
          message: ATTENDANCE.confirmOutBody,
          confirm: ATTENDANCE.confirmOutYes,
          cancel: ATTENDANCE.confirmOutNo,
          onConfirm: send,
        })
      : send();
  const waiting = queue[0];
  return (
    <View style={styles.wrap}>
      {state.kind === 'out' && state.fromEarlier && day ? (
        <Text variant="bodySm" tone="secondary">
          {ATTENDANCE.stillIn(relativeDate(day.workDate))}
        </Text>
      ) : null}
      {waiting ? (
        <Text variant="bodySm" tone="secondary">
          {ATTENDANCE.queued(clockTime(waiting.tappedAt))}
        </Text>
      ) : null}
      {state.kind === 'done' ? (
        <DoneActions state={state} workDate={day?.workDate ?? null} onFix={onFix} />
      ) : state.kind === 'sending' ? null : (
        <Button
          label={state.kind === 'out' ? ATTENDANCE.checkOut : ATTENDANCE.checkIn}
          variant={state.kind === 'out' ? 'secondary' : 'primary'}
          icon={
            state.kind === 'out' ? (
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
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 12 } });

/** The end of the day: what it says, "Fix times" after an automatic end, and Resume duty. */
function DoneActions({
  state,
  workDate,
  onFix,
}: {
  readonly state: Extract<DayState, { kind: 'done' }>;
  readonly workDate: string | null;
  readonly onFix: (workDate: string) => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const resume = useResumeDuty();
  return (
    <>
      <Text variant="bodySm" tone="secondary">
        {state.autoClosed ? ATTENDANCE.autoClosed : ATTENDANCE.dayDone}
      </Text>
      {state.autoClosed && workDate ? (
        <Button
          label={ATTENDANCE.fixTimes}
          variant="secondary"
          onPress={() => onFix(workDate)}
          fullWidth
        />
      ) : null}
      {state.canResume ? (
        <Button
          label={ATTENDANCE.resume}
          variant="secondary"
          icon={<RotateCcw size={18} color={theme.colors.textPrimary} />}
          pending={resume.isPending}
          onPress={() =>
            resume.mutate(undefined, {
              onSuccess: () => toast(ATTENDANCE.resumed),
              onError: (error) => toast(describeError(error)),
            })
          }
          fullWidth
        />
      ) : null}
    </>
  );
}
