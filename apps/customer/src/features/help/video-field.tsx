import { VIDEO_MAX_SECONDS } from '@oneohm/domain';
import { PressableScale, Text, type UploadableFile, useTheme } from '@oneohm/mobile-ui';
import { Film, Video, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SUPPORT } from '@/copy/care';
import { REQUEST_MEDIA } from '@/copy/request-media';
import { clock, pickRequestVideo, type VideoSource } from './request-media';

export interface PickedVideo {
  readonly file: UploadableFile;
  readonly seconds: number | null;
}

function Choice({
  label,
  onPress,
  children,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.choice, { borderColor: theme.colors.borderStrong }]}
    >
      {children}
      <Text variant="label" tone="secondary">
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * One optional short video (PRD 5.5), recorded with the camera (it stops at one minute)
 * or picked from the gallery. The browser preview picks a file only.
 */
export function VideoField({
  value,
  onChange,
}: {
  readonly value: PickedVideo | null;
  readonly onChange: (video: PickedVideo | null) => void;
}) {
  const theme = useTheme();
  const [problem, setProblem] = useState<string | null>(null);
  const pick = async (source: VideoSource) => {
    setProblem(null);
    const picked = await pickRequestVideo(source);
    if (picked === null) return;
    if (picked === 'denied')
      setProblem(source === 'camera' ? SUPPORT.cameraDenied : SUPPORT.libraryDenied);
    else if (picked === 'tooLong') setProblem(REQUEST_MEDIA.videoTooLong(VIDEO_MAX_SECONDS));
    else if (picked === 'tooLarge') setProblem(REQUEST_MEDIA.videoTooLarge);
    else onChange(picked);
  };
  return (
    <View style={styles.root}>
      <Text variant="label" tone="secondary">
        {REQUEST_MEDIA.videoLabel}
      </Text>
      {value ? (
        <View style={[styles.box, { borderColor: theme.colors.borderSubtle }]}>
          <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>
            <Film size={18} color={theme.colors.onAccentSoft} />
          </View>
          <View style={styles.grow}>
            <Text variant="bodySm">{REQUEST_MEDIA.videoReady}</Text>
            <Text variant="label" tone="tertiary" numberOfLines={1}>
              {value.seconds === null ? value.file.name : clock(value.seconds)}
            </Text>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={REQUEST_MEDIA.removeVideo}
            onPress={() => onChange(null)}
            style={[styles.remove, { backgroundColor: theme.colors.surfaceSunken }]}
          >
            <X size={16} color={theme.colors.textPrimary} />
          </PressableScale>
        </View>
      ) : (
        <View style={styles.row}>
          {Platform.OS === 'web' ? null : (
            <Choice label={REQUEST_MEDIA.recordVideo} onPress={() => void pick('camera')}>
              <Video size={18} color={theme.colors.accent} />
            </Choice>
          )}
          <Choice label={REQUEST_MEDIA.chooseVideo} onPress={() => void pick('library')}>
            <Film size={18} color={theme.colors.accent} />
          </Choice>
        </View>
      )}
      {problem ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {problem}
        </Text>
      ) : (
        <Text variant="bodySm" tone="tertiary">
          {REQUEST_MEDIA.videoHint(VIDEO_MAX_SECONDS)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexGrow: 1,
    flexBasis: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 2 },
  remove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
