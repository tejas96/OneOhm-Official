import { PressableScale, Text, type UploadableFile, useTheme } from '@oneohm/mobile-ui';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { Image, StyleSheet, View } from 'react-native';
import { SUPPORT } from '@/copy/care';
import { MAX_REQUEST_PHOTOS } from './request-photos';

/** Photos chosen for a new request, with buttons to add more (camera or gallery). */
export function PhotoStrip({
  photos,
  onAdd,
  onRemove,
}: {
  readonly photos: readonly UploadableFile[];
  readonly onAdd: (source: 'camera' | 'library') => void;
  readonly onRemove: (index: number) => void;
}) {
  const theme = useTheme();
  const full = photos.length >= MAX_REQUEST_PHOTOS;
  const tile = [styles.tile, { backgroundColor: theme.colors.surfaceSunken }];
  return (
    <View style={styles.root}>
      <Text variant="label" tone="secondary">
        {SUPPORT.photosLabel}
      </Text>
      <View style={styles.row}>
        {photos.map((photo, index) => (
          <View key={photo.uri} style={tile}>
            <Image
              source={{ uri: photo.uri }}
              style={styles.image}
              accessibilityLabel={photo.name}
            />
            <PressableScale
              onPress={() => onRemove(index)}
              accessibilityRole="button"
              accessibilityLabel={SUPPORT.removePhoto}
              style={[styles.remove, { backgroundColor: theme.colors.surfaceRaised }]}
            >
              <X size={14} color={theme.colors.textPrimary} />
            </PressableScale>
          </View>
        ))}
        {full ? null : (
          <>
            <AddTile label={SUPPORT.takePhoto} onPress={() => onAdd('camera')}>
              <Camera size={20} color={theme.colors.accent} />
            </AddTile>
            <AddTile label={SUPPORT.choosePhotos} onPress={() => onAdd('library')}>
              <ImagePlus size={20} color={theme.colors.accent} />
            </AddTile>
          </>
        )}
      </View>
      <Text variant="bodySm" tone="tertiary">
        {SUPPORT.photosHint}
      </Text>
    </View>
  );
}

function AddTile({
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
      style={[styles.tile, styles.add, { borderColor: theme.colors.borderStrong }]}
    >
      {children}
      <Text variant="label" tone="secondary" style={styles.center}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 88, height: 88, borderRadius: 14, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
  },
  center: { textAlign: 'center' },
});
