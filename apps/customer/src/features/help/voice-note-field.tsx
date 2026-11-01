import { Button, PressableScale, Text, type UploadableFile, useTheme } from '@oneohm/mobile-ui';
import { Mic, Square, X } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { REQUEST_MEDIA } from '@/copy/request-media';
import { clock, voiceFileOf } from './request-media';
import { useVoiceNote } from './use-voice-note';
import { VoicePlayback } from './voice-playback';

export interface RecordedVoice {
  readonly file: UploadableFile;
  readonly seconds: number;
}

/** Recording, with a stop button and the time so far. */
function Recording({
  seconds,
  max,
  onStop,
}: {
  readonly seconds: number;
  readonly max: number;
  readonly onStop: () => void;
}) {
  const theme = useTheme();
  const tone = theme.status.overdue;
  return (
    <View style={[styles.box, { borderColor: tone.solid, backgroundColor: tone.tint }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={REQUEST_MEDIA.stop}
        onPress={onStop}
        style={[styles.round, { backgroundColor: tone.solid }]}
      >
        <Square size={14} color={theme.colors.onAccent} fill={theme.colors.onAccent} />
      </PressableScale>
      <View style={styles.grow}>
        <Text variant="titleMd" style={styles.clock}>
          {`${clock(seconds)} / ${clock(max)}`}
        </Text>
        <Text variant="bodySm" tone="secondary" accessibilityLiveRegion="polite">
          {REQUEST_MEDIA.recording}
        </Text>
      </View>
    </View>
  );
}

/**
 * An optional voice note for the request (PRD 5.5): record, stop, listen, remove. The
 * microphone is asked for only when the customer taps record. The browser preview
 * cannot record well, so it says to use the phone app instead.
 */
export function VoiceNoteField({
  value,
  onChange,
  onRecording,
}: {
  readonly value: RecordedVoice | null;
  readonly onChange: (voice: RecordedVoice | null) => void;
  readonly onRecording: (recording: boolean) => void;
}) {
  const theme = useTheme();
  const recorded = useCallback(
    (uri: string, seconds: number) => onChange({ file: voiceFileOf(uri), seconds }),
    [onChange],
  );
  const voice = useVoiceNote(recorded);
  const busy = voice.phase !== 'idle';
  useEffect(() => onRecording(busy), [busy, onRecording]);
  const problem =
    voice.problem === 'denied'
      ? REQUEST_MEDIA.micDenied
      : voice.problem === 'failed'
        ? REQUEST_MEDIA.recordFailed
        : null;
  const web = Platform.OS === 'web';
  return (
    <View style={styles.root}>
      <Text variant="label" tone="secondary">
        {REQUEST_MEDIA.voiceLabel}
      </Text>
      {web ? null : value ? (
        <View style={[styles.box, { borderColor: theme.colors.borderSubtle }]}>
          <VoicePlayback uri={value.file.uri} fallbackSeconds={value.seconds} />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={REQUEST_MEDIA.removeVoice}
            onPress={() => onChange(null)}
            style={[styles.remove, { backgroundColor: theme.colors.surfaceSunken }]}
          >
            <X size={16} color={theme.colors.textPrimary} />
          </PressableScale>
        </View>
      ) : voice.phase === 'recording' ? (
        <Recording seconds={voice.seconds} max={voice.max} onStop={() => void voice.stop()} />
      ) : (
        <Button
          label={REQUEST_MEDIA.record}
          variant="secondary"
          icon={<Mic size={18} color={theme.colors.textPrimary} />}
          pending={voice.phase === 'starting'}
          onPress={() => void voice.start()}
          fullWidth
        />
      )}
      {problem ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {problem}
        </Text>
      ) : (
        <Text variant="bodySm" tone="tertiary">
          {web ? REQUEST_MEDIA.voiceOnWeb : REQUEST_MEDIA.voiceHint(voice.max / 60)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: 2 },
  clock: { fontVariant: ['tabular-nums'] },
});
