import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { type AudioSource, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { MEDIA } from '@/copy/media';
import { ProgressLine } from './progress-line';

/** A finite length in seconds; a browser's WebM recording may report none until played. */
const known = (seconds: number | undefined) =>
  seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : null;

/**
 * Play and pause one recording, with where it is and how long it is. Playing again
 * after the end starts from the beginning.
 */
export function VoicePlayback({
  source,
  fallbackSeconds,
}: {
  readonly source: AudioSource;
  readonly fallbackSeconds?: number;
}) {
  const theme = useTheme();
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const length = known(status.duration) ?? known(fallbackSeconds) ?? 0;
  const position = Math.min(status.currentTime, length || status.currentTime);
  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (length > 0 && status.currentTime >= length - 0.05)) {
      void player.seekTo(0);
    }
    player.play();
  };
  const Icon = status.playing ? Pause : Play;
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={status.playing ? MEDIA.voice.pause : MEDIA.voice.play}
        onPress={toggle}
        style={[styles.button, { backgroundColor: theme.colors.accentSoft }]}
      >
        <Icon size={20} color={theme.colors.onAccentSoft} />
      </PressableScale>
      <View style={styles.track}>
        <ProgressLine value={length > 0 ? position / length : 0} />
        <Text variant="mono" tone="secondary">
          {`${MEDIA.clock(position)} / ${MEDIA.clock(length)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { flex: 1, gap: 6 },
});
