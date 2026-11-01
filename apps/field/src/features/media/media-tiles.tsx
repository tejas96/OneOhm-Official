import { isAudioType, isVideoType } from '@oneohm/domain';
import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { type AudioSource, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { FileText, Film, Mic, Pause, Play } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { API_BASE_URL, currentToken } from '@/api/api';
import { MEDIA } from '@/copy/media';
import { openProtectedFile } from '@/lib/open-file';

export const TILE_SIZE = 96;

const fileUrl = (id: string) => `${API_BASE_URL.replace(/\/+$/, '')}/v1/documents/${id}/file`;

/**
 * The stored voice note as something the player can open. Phones send the token as a
 * header; the browser preview cannot, so it fetches the file once and plays a blob.
 */
async function sourceOf(id: string): Promise<{ source: AudioSource; release?: () => void }> {
  const token = currentToken();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  if (Platform.OS !== 'web') return { source: { uri: fileUrl(id), headers } };
  const response = await fetch(fileUrl(id), { headers });
  if (!response.ok) throw new Error(`The file answered ${response.status}.`);
  const url = URL.createObjectURL(await response.blob());
  return { source: url, release: () => URL.revokeObjectURL(url) };
}

/** The icon a queued or stored file shows when there is no picture of it. */
export function fileIconOf(contentType: string) {
  if (isAudioType(contentType)) return Mic;
  if (isVideoType(contentType)) return Film;
  return FileText;
}

/** An uploaded voice note: tap to play or pause it where it is. */
export function VoiceTile({ id, name }: { readonly id: string; readonly name: string }) {
  const theme = useTheme();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const release = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => release.current?.(), []);
  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (state !== 'ready') {
      setState('loading');
      try {
        const loaded = await sourceOf(id);
        release.current = loaded.release;
        player.replace(loaded.source);
        setState('ready');
      } catch {
        setState('failed');
        return;
      }
    } else if (status.didJustFinish || status.currentTime >= status.duration - 0.05) {
      void player.seekTo(0);
    }
    player.play();
  };
  const Icon = status.playing ? Pause : Play;
  const time = status.duration > 0 && Number.isFinite(status.duration) ? status.duration : null;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={(status.playing ? MEDIA.tile.pauseVoice : MEDIA.tile.playVoice)(name)}
      onPress={() => void toggle()}
      style={styles.fill}
    >
      <View style={[styles.round, { backgroundColor: theme.colors.accentSoft }]}>
        {state === 'loading' ? (
          <ActivityIndicator size="small" color={theme.colors.onAccentSoft} />
        ) : (
          <Icon size={18} color={theme.colors.onAccentSoft} />
        )}
      </View>
      <Text variant="label" tone="secondary" numberOfLines={1}>
        {state === 'failed'
          ? MEDIA.tile.loadFailed
          : time
            ? MEDIA.clock(status.playing ? status.currentTime : time)
            : MEDIA.tile.voice}
      </Text>
    </PressableScale>
  );
}

/** An uploaded video: opens in the phone's player (a new tab in the web preview). */
export function VideoTile({
  id,
  name,
  contentType,
}: {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await openProtectedFile(`/v1/documents/${id}/file`, name, contentType);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={MEDIA.tile.openVideo(name)}
      onPress={() => void open()}
      style={styles.fill}
    >
      <View style={[styles.round, { backgroundColor: theme.colors.surfaceRaised }]}>
        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
        ) : (
          <Play size={18} color={theme.colors.textPrimary} fill={theme.colors.textPrimary} />
        )}
      </View>
      <Text variant="label" tone="secondary" numberOfLines={1}>
        {MEDIA.tile.video}
      </Text>
    </PressableScale>
  );
}

/** The playable body of a stored voice note or video tile; null for anything else. */
export function MediaBody({
  file,
}: {
  readonly file: { readonly id: string; readonly name: string; readonly contentType: string };
}) {
  if (isAudioType(file.contentType)) return <VoiceTile id={file.id} name={file.name} />;
  if (isVideoType(file.contentType))
    return <VideoTile id={file.id} name={file.name} contentType={file.contentType} />;
  return null;
}

const styles = StyleSheet.create({
  fill: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
