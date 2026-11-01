import type { UploadableFile } from '@oneohm/mobile-ui';
import * as ImagePicker from 'expo-image-picker';
import { geotagFromExif } from '@/features/uploads/geotag';
import type { Geotag } from '@/features/uploads/queue-logic';

export type PhotoSource = 'camera' | 'library';

/** A picked photo and, when its EXIF has one, where it was taken. */
export interface PickedPhoto {
  readonly file: UploadableFile;
  readonly geotag: Geotag | null;
}

const MAX_PER_PICK = 6;

/**
 * Asks for the camera or photo permission, then opens the camera or the gallery.
 * Resolves with the chosen photos ([] when cancelled) or 'denied'. EXIF is read for the
 * geotag where the phone gives it; the web preview opens the browser's file picker.
 */
export async function pickPhotos(source: PhotoSource): Promise<PickedPhoto[] | 'denied'> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    exif: true,
    allowsMultipleSelection: source === 'library',
    selectionLimit: MAX_PER_PICK,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  const stamp = Date.now();
  return result.assets.map((asset, index) => ({
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `site-photo-${stamp}-${index + 1}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
      ...(asset.file ? { file: asset.file } : {}),
    },
    geotag: geotagFromExif(asset.exif),
  }));
}
