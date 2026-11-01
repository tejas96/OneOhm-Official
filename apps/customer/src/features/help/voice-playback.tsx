import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { REQUEST_MEDIA } from '@/copy/request-media';
import { clock } from './request-media';

const known = (seconds: number | undefined) =>
  seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : null;

/** Listen to the recorded note before sending it: play, pause, and how far it has got. */
export function VoicePlayback({
  uri,
  fallbackSeconds,
}: {
  readonly uri: string;
  readonly fallbackSeconds: number;
}) {
  const theme = useTheme();
  const player = useAudioPlayer(uri);
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
  const done = length > 0 ? Math.min(1, position / length) : 0;
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={status.playing ? REQUEST_MEDIA.pause : REQUEST_MEDIA.play}
        onPress={toggle}
        style={[styles.button, { backgroundColor: theme.colors.accentSoft }]}
      >
        <Icon size={18} color={theme.colors.onAccentSoft} />
      </PressableScale>
      <View style={styles.track}>
        <View style={[styles.line, { backgroundColor: theme.colors.borderSubtle }]}>
          <View
            style={[
              styles.line,
              { width: `${Math.round(done * 100)}%`, backgroundColor: theme.colors.accent },
            ]}
          />
        </View>
        <Text variant="label" tone="secondary" style={styles.time}>
          {`${clock(position)} / ${clock(length)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { flex: 1, gap: 4 },
  line: { height: 4, borderRadius: 2, overflow: 'hidden' },
  time: { fontVariant: ['tabular-nums'] },
});
