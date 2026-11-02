import type { Attachment } from '@oneohm/api-contracts';
import { isMediaType } from '@oneohm/domain';
import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { FileText, ImageIcon, RotateCw, X } from 'lucide-react-native';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import { API_BASE_URL, currentToken } from '@/api/api';
import { TASK } from '@/copy/tasks';
import { fileIconOf, MediaBody } from '@/features/media/media-tiles';
import type { QueuedUpload } from '@/features/uploads/queue-logic';
import { previewUri } from '@/features/uploads/upload-store';

const SIZE = 96;

/**
 * A file already on the task. Phones show the photo's small preview (400 px WebP; the
 * request carries the token); the web preview cannot send headers with an image, so it
 * shows a tile.
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
      {isMediaType(file.contentType) ? (
        <MediaBody file={file} />
      ) : showPhoto ? (
        <Image
          source={{
            uri: `${API_BASE_URL.replace(/\/+$/, '')}/v1/documents/${file.id}/thumbnail`,
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
            disabled={removing}
            accessibilityState={{ disabled: removing, busy: removing }}
            accessibilityRole="button"
            accessibilityLabel={`${image ? TASK.evidence.remove : TASK.evidence.removeFile}: ${file.name}`}
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

/**
 * A file kept on this phone: its thumbnail with upload progress, "waiting" while it
 * has no signal, or a retry when it was refused.
 */
export function PendingTile({
  item,
  progress,
  onRetry,
  onDiscard,
}: {
  readonly item: QueuedUpload;
  readonly progress: number | undefined;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}) {
  const theme = useTheme();
  const failed = item.error !== null;
  const sending = progress !== undefined;
  const percent = Math.round((progress ?? 0) * 100);
  const image = item.type.startsWith('image/');
  const PendingIcon = fileIconOf(item.type);
  return (
    <View style={[styles.tile, { backgroundColor: theme.colors.surfaceSunken }]}>
      {image ? (
        <Image source={{ uri: previewUri(item) }} style={[styles.image, styles.dim]} />
      ) : (
        <View style={styles.placeholder}>
          <PendingIcon size={22} color={theme.colors.textSecondary} />
          <Text variant="label" tone="secondary" numberOfLines={2} style={styles.name}>
            {item.name}
          </Text>
        </View>
      )}
      <View
        style={[
          styles.overlay,
          {
            // No signal is not a fault: the waiting tone; a refused file is red.
            backgroundColor:
              failed && !sending
                ? theme.status[item.autoRetry ? 'waiting' : 'overdue'].tint
                : 'transparent',
          },
        ]}
      >
        {failed && !sending ? (
          <FailedBadge item={item} onRetry={onRetry} />
        ) : (
          <Text
            variant="label"
            color={theme.colors.textPrimary}
            style={[styles.badge, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            {sending ? TASK.evidence.uploading(percent) : TASK.evidence.queued}
          </Text>
        )}
      </View>
      {sending ? (
        <View style={[styles.bar, { backgroundColor: theme.colors.borderSubtle }]}>
          <View
            style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.colors.accent }]}
          />
        </View>
      ) : null}
      {failed && !sending ? (
        <View style={styles.corner}>
          <PressableScale
            onPress={onDiscard}
            accessibilityRole="button"
            accessibilityLabel={`${TASK.evidence.removeFile}: ${item.name}`}
            style={[styles.cornerButton, { backgroundColor: theme.colors.surfaceRaised }]}
          >
            <X size={14} color={theme.colors.textPrimary} />
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

function FailedBadge({
  item,
  onRetry,
}: {
  readonly item: QueuedUpload;
  readonly onRetry: () => void;
}) {
  const theme = useTheme();
  const tone = theme.status[item.autoRetry ? 'waiting' : 'overdue'];
  return (
    <PressableScale
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={
        item.autoRetry
          ? `${TASK.evidence.retrying} ${TASK.evidence.retryNow}`
          : `${TASK.evidence.retry}: ${item.error}`
      }
      style={styles.retry}
    >
      <RotateCw size={18} color={tone.fg} />
      <Text variant="label" color={tone.fg}>
        {item.autoRetry ? TASK.evidence.retryNow : TASK.evidence.retry}
      </Text>
    </PressableScale>
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
