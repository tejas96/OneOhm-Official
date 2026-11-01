import {
  Button,
  PressableScale,
  Sheet,
  Text,
  type UploadableFile,
  useTheme,
} from '@oneohm/mobile-ui';
import { Mic, RotateCcw, Square } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { MEDIA } from '@/copy/media';
import { shortMoment } from '@/lib/dates';
import { ProgressLine } from './progress-line';
import { useVoiceRecorder, type VoiceRecorder } from './use-voice-recorder';
import { VoicePlayback } from './voice-playback';
import { extensionOfVoice, voiceTypeOf } from './voice-preset';

/** Held this long, letting go stops the recording (hold to talk); a tap keeps it going. */
const HOLD_MS = 600;

/** The recorded file, ready for the upload queue. The web preview hands over the blob. */
async function fileOf(uri: string): Promise<UploadableFile> {
  // "1 Nov, 6:19 pm" → "1 Nov 6.19 pm": readable, and safe in a file name.
  const stamp = shortMoment(new Date().toISOString()).replace(',', '').replace(':', '.');
  const blob = Platform.OS === 'web' ? await (await fetch(uri)).blob() : undefined;
  const type = voiceTypeOf(blob?.type);
  const name = `${MEDIA.voice.fileName(stamp)}.${extensionOfVoice(type)}`;
  return { uri, name, type, ...(blob ? { file: blob } : {}) };
}

function RecordButton({ recorder }: { readonly recorder: VoiceRecorder }) {
  const theme = useTheme();
  // The press that started the recording, and when: holding past HOLD_MS and letting go
  // stops it; a short tap leaves it running until the next tap.
  const press = useRef<{ startedAt: number } | null>(null);
  const recording = recorder.phase === 'recording';
  const onPressIn = () => {
    if (recorder.phase !== 'idle') return;
    press.current = { startedAt: Date.now() };
    void recorder.start();
  };
  const onPressOut = () => {
    const started = press.current;
    // Held and let go: stop. The press is cleared by the `onPress` that follows.
    if (started && Date.now() - started.startedAt > HOLD_MS) void recorder.stop();
  };
  const onPress = () => {
    if (press.current) {
      press.current = null;
      return;
    }
    // A press that did not start it: the second tap stops it (or a very quick first tap starts it).
    if (recording) void recorder.stop();
    else if (recorder.phase === 'idle') void recorder.start();
  };
  const tone = recording ? theme.status.overdue : null;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={recording ? MEDIA.voice.stopLabel : MEDIA.voice.startLabel}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      style={[
        styles.record,
        { backgroundColor: tone ? tone.tint : theme.colors.accent },
        tone ? { borderColor: tone.solid, borderWidth: 2 } : null,
      ]}
    >
      {recorder.phase === 'starting' ? (
        <ActivityIndicator color={theme.colors.onAccent} />
      ) : recording ? (
        <Square size={26} color={theme.status.overdue.fg} fill={theme.status.overdue.fg} />
      ) : (
        <Mic size={32} color={theme.colors.onAccent} />
      )}
    </PressableScale>
  );
}

/**
 * Records a short voice note (PRD 4.2): tap to start and stop, or hold and let go; a
 * visible timer up to two minutes; then listen, record again or save it to upload.
 */
export function VoiceNoteSheet({
  open,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave: (file: UploadableFile) => Promise<void> | void;
}) {
  const theme = useTheme();
  const recorder = useVoiceRecorder();
  const [saving, setSaving] = useState(false);
  const recorded = recorder.phase === 'recorded' && recorder.uri;
  const close = () => {
    recorder.reset();
    onClose();
  };
  const save = async () => {
    if (!recorder.uri) return;
    setSaving(true);
    try {
      await onSave(await fileOf(recorder.uri));
      recorder.reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };
  const problem =
    recorder.problem === 'denied'
      ? MEDIA.voice.denied
      : recorder.problem === 'failed'
        ? MEDIA.voice.failed
        : null;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={MEDIA.voice.title}
      description={MEDIA.voice.body(recorder.max)}
      closeLabel={COMMON.close}
      footer={
        recorded ? (
          <View style={styles.footer}>
            <Button
              label={MEDIA.voice.again}
              variant="secondary"
              icon={<RotateCcw size={16} color={theme.colors.textPrimary} />}
              onPress={recorder.reset}
              style={styles.flex}
            />
            <Button
              label={MEDIA.voice.save}
              pending={saving}
              onPress={() => void save()}
              style={styles.flex}
            />
          </View>
        ) : null
      }
    >
      {recorded ? (
        <VoicePlayback source={recorder.uri} fallbackSeconds={recorder.seconds} />
      ) : (
        <View style={styles.stage}>
          <RecordButton recorder={recorder} />
          <View style={styles.timer}>
            <Text variant="displayMd" style={styles.clock}>
              {MEDIA.clock(recorder.seconds)}
            </Text>
            <Text variant="label" tone="tertiary">
              {MEDIA.voice.limit(recorder.max)}
            </Text>
          </View>
          <ProgressLine value={recorder.seconds / recorder.max} tone="recording" />
          <Text variant="bodySm" tone="secondary" style={styles.center}>
            {recorder.phase === 'recording' ? MEDIA.voice.recording : MEDIA.voice.start}
          </Text>
        </View>
      )}
      {problem ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', gap: 14, paddingVertical: 8 },
  record: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  clock: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
