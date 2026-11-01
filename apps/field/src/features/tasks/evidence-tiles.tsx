import type { Attachment } from '@oneohm/api-contracts';
import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { FileText, ImageIcon, RotateCw, X } from 'lucide-react-native';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import { API_BASE_URL, currentToken } from '@/api/api';
import { TASK } from '@/copy/tasks';
import type { PendingPhoto } from './use-evidence';

const SIZE = 96;

/**
 * A file already on the task. Phones show the photo itself (the request carries the
 * token); the web preview cannot send headers with an image, so it shows a tile.
 */
export function AttachmentTile({
  file,
  removable,
  removing,
  onRemove,
}: {
  readonly file: Attachment;
  readonly removable: boolean;
  readonly removing: boolean;
  readonly onRemove: () => void;
}) {
  const theme = useTheme();
  const image = file.contentType.startsWith('image/');
  const token = currentToken();
  const showPhoto = image && Platform.OS !== 'web' && token;
  const Icon = image ? ImageIcon : FileText;
  return (
    <View style={[styles.tile, { backgroundColor: theme.colors.surfaceSunken }]}>
      {showPhoto ? (
        <Image
          source={{
            uri: `${API_BASE_URL.replace(/\/+$/, '')}/v1/documents/${file.id}/file`,
            headers: { authorization: `Bearer ${token}` },
          }}
          style={styles.image}
          accessibilityLabel={file.name}
        />
      ) : (
        <View style={styles.placeholder}>
          <Icon size={22} color={theme.colors.textSecondary} />
          <Text variant="label" tone="secondary" numberOfLines={2} style={styles.name}>
            {file.name}
          </Text>
        </View>
      )}
      {removable ? (
        <View style={styles.corner}>
          <PressableScale
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`${TASK.evidence.remove}: ${file.name}`}
            style={[styles.cornerButton, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            {removing ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <X size={14} color={theme.colors.textPrimary} />
            )}
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

/** A photo picked on this phone: its thumbnail with upload progress, or a retry. */
export function PendingTile({
  photo,
  onRetry,
  onDiscard,
}: {
  readonly photo: PendingPhoto;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}) {
  const theme = useTheme();
  const failed = photo.error !== null;
  const percent = Math.round(photo.progress * 100);
  return (
    <View style={[styles.tile, { backgroundColor: theme.colors.surfaceSunken }]}>
      <Image source={{ uri: photo.file.uri }} style={[styles.image, styles.dim]} />
      <View
        style={[
          styles.overlay,
          { backgroundColor: failed ? theme.status.overdue.tint : 'transparent' },
        ]}
      >
        {failed ? (
          <PressableScale
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`${TASK.evidence.retry}: ${photo.error}`}
            style={styles.retry}
          >
            <RotateCw size={18} color={theme.status.overdue.fg} />
            <Text variant="label" color={theme.status.overdue.fg}>
              {TASK.evidence.retry}
            </Text>
          </PressableScale>
        ) : (
          <Text variant="label" color={theme.colors.textPrimary} style={styles.badge}>
            {TASK.evidence.uploading(percent)}
          </Text>
        )}
      </View>
      {failed ? null : (
        <View style={[styles.bar, { backgroundColor: theme.colors.borderSubtle }]}>
          <View
            style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.colors.accent }]}
          />
        </View>
      )}
      {failed ? (
        <View style={styles.corner}>
          <PressableScale
            onPress={onDiscard}
            accessibilityRole="button"
            accessibilityLabel={TASK.evidence.remove}
            style={[styles.cornerButton, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            <X size={14} color={theme.colors.textPrimary} />
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: SIZE, height: SIZE, borderRadius: 14, overflow: 'hidden' },
  image: { width: SIZE, height: SIZE },
  dim: { opacity: 0.75 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  name: { textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  retry: { alignItems: 'center', gap: 4, padding: 8 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bar: { position: 'absolute', left: 8, right: 8, bottom: 8, height: 4, borderRadius: 2 },
  fill: { height: 4, borderRadius: 2 },
  corner: { position: 'absolute', top: 6, right: 6 },
  cornerButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
