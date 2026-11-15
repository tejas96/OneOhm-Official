import type { MyWorkday } from '@oneohm/api-contracts';
import { Button, PressableScale, Sheet, StatusPill, Text } from '@oneohm/mobile-ui';
import { useSyncExternalStore } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { DUTY } from '@/copy/duty';
import { useCurrentUser } from '@/session/session-provider';
import { BatteryHint } from './battery-hint';
import { askForPermission, startRecording } from './duty-recording';
import { dutyQueue } from './duty-sender';
import { type RouteLine, routeLineOf } from './duty-state';
import { dutyStatus } from './duty-status';
import { useRecordingWanted } from './use-recording-wanted';

function labelOf(line: NonNullable<RouteLine>): string {
  if (line.kind === 'waiting') return DUTY.waiting(line.count);
  if (line.kind === 'fix') return DUTY.routeFix;
  return line.kind === 'foreground' ? DUTY.routeForeground : DUTY.routeOn;
}

/**
 * While on duty, the one line about the route on the Today card: how it records, what to fix
 * or how many points wait to upload, with the "all the time" explanation sheet and, once on
 * some phones, the battery-saver hint.
 */
export function DutySection({ workday }: { readonly workday: MyWorkday }) {
  const user = useCurrentUser();
  const recording = useRecordingWanted(workday);
  const status = useSyncExternalStore(dutyStatus.subscribe, dutyStatus.get);
  const waiting = useSyncExternalStore(dutyQueue.subscribe, () => dutyQueue.waiting(user.id));
  if (Platform.OS === 'web' || !recording) return null;
  const line = routeLineOf({ recording, mode: status.mode, waiting, stalled: status.stalled });
  const open = () => dutyStatus.set({ explain: true });
  const close = () => dutyStatus.set({ explain: false });
  const proceed = async () => {
    close();
    await askForPermission();
    dutyStatus.set({ mode: await startRecording(user.id) });
  };
  const fixable = line?.kind === 'fix' || line?.kind === 'foreground';
  return (
    <View style={styles.wrap}>
      {line ? (
        <PressableScale
          accessibilityRole={fixable ? 'button' : 'text'}
          disabled={!fixable}
          onPress={open}
          style={styles.line}
        >
          <StatusPill
            size="sm"
            tone={line.kind === 'on' ? 'onTrack' : line.kind === 'fix' ? 'atRisk' : 'waiting'}
            label={labelOf(line)}
          />
        </PressableScale>
      ) : null}
      <BatteryHint />
      <Sheet
        open={status.explain}
        onClose={close}
        title={DUTY.sheetTitle}
        description={DUTY.sheetBody}
        closeLabel={DUTY.sheetClose}
        footer={
          <View style={styles.footer}>
            <Button label={DUTY.sheetContinue} onPress={() => void proceed()} fullWidth />
            <Button label={DUTY.sheetLater} variant="quiet" onPress={close} fullWidth />
          </View>
        }
      >
        <Text variant="bodySm" tone="secondary">
          {DUTY.sheetBody}
        </Text>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  line: { flexDirection: 'row', alignSelf: 'flex-start' },
  footer: { gap: 8 },
});
