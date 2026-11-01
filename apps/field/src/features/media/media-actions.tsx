import { MAX_VIDEO_BYTES, megabytes, VIDEO_MAX_SECONDS } from '@oneohm/domain';
import {
  Button,
  PressableScale,
  Sheet,
  Text,
  type UploadableFile,
  useTheme,
} from '@oneohm/mobile-ui';
import { Clapperboard, Mic, Video } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { MEDIA } from '@/copy/media';
import { type PickedVideo, pickVideo, type VideoPick, type VideoSource } from './pick-video';
import { VoiceNoteSheet } from './voice-note-sheet';

function noticeOf(pick: VideoPick, source: VideoSource): string | null {
  if (pick === 'denied') return source === 'camera' ? MEDIA.cameraDenied : MEDIA.libraryDenied;
  if (pick === 'tooLong') return MEDIA.videoTooLong(VIDEO_MAX_SECONDS);
  if (pick === 'tooLarge') return MEDIA.videoTooLarge(megabytes(MAX_VIDEO_BYTES));
  return null;
}

function Choice({
  icon,
  title,
  hint,
  onPress,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly hint: string;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[
        styles.choice,
        { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderSubtle },
      ]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: theme.colors.accentSoft }]}>{icon}</View>
      <View style={styles.flex}>
        <Text variant="titleMd">{title}</Text>
        <Text variant="bodySm" tone="secondary">
          {hint}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * "Video" and "Voice note" beside the photo buttons (PRD 4.2). A video is recorded now
 * or chosen from the gallery; a voice note is recorded in a sheet. Both go to the
 * upload queue through the callbacks.
 */
export function MediaActions({
  locate,
  onVideo,
  onVoice,
  onNotice,
}: {
  readonly locate: boolean;
  readonly onVideo: (video: PickedVideo) => Promise<void> | void;
  readonly onVoice: (file: UploadableFile) => Promise<void> | void;
  readonly onNotice: (notice: string | null) => void;
}) {
  const theme = useTheme();
  const [sheet, setSheet] = useState<'video' | 'voice' | null>(null);
  const choose = async (source: VideoSource) => {
    setSheet(null);
    onNotice(null);
    const pick = await pickVideo(source, locate);
    const notice = noticeOf(pick, source);
    if (notice) onNotice(notice);
    else if (pick && typeof pick === 'object') await onVideo(pick);
  };
  return (
    <>
      <View style={styles.row}>
        <Button
          label={MEDIA.video}
          variant="secondary"
          icon={<Video size={16} color={theme.colors.textPrimary} />}
          onPress={() => setSheet('video')}
          style={styles.flex}
        />
        <Button
          label={MEDIA.voiceNote}
          variant="secondary"
          icon={<Mic size={16} color={theme.colors.textPrimary} />}
          onPress={() => {
            onNotice(null);
            setSheet('voice');
          }}
          style={styles.flex}
        />
      </View>
      <Sheet
        open={sheet === 'video'}
        onClose={() => setSheet(null)}
        title={MEDIA.videoSheet.title}
        description={MEDIA.videoSheet.body(VIDEO_MAX_SECONDS)}
        closeLabel={COMMON.close}
      >
        <Choice
          icon={<Video size={20} color={theme.colors.onAccentSoft} />}
          title={MEDIA.videoSheet.record}
          hint={MEDIA.videoSheet.recordHint}
          onPress={() => void choose('camera')}
        />
        <Choice
          icon={<Clapperboard size={20} color={theme.colors.onAccentSoft} />}
          title={MEDIA.videoSheet.choose}
          hint={MEDIA.videoSheet.chooseHint}
          onPress={() => void choose('library')}
        />
      </Sheet>
      <VoiceNoteSheet open={sheet === 'voice'} onClose={() => setSheet(null)} onSave={onVoice} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
