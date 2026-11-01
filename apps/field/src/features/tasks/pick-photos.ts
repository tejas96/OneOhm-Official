import type { UploadableFile } from '@oneohm/mobile-ui';
import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';

const MAX_PER_PICK = 6;

/**
 * Asks for the camera or photo permission, then opens the camera or the gallery.
 * Resolves with the chosen photos ([] when cancelled) or 'denied'. On the web preview
 * both open the browser's file picker (the camera one asks for `capture`).
 */
export async function pickPhotos(source: PhotoSource): Promise<UploadableFile[] | 'denied'> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    exif: false,
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
    uri: asset.uri,
    name: asset.fileName ?? `site-photo-${stamp}-${index + 1}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
    ...(asset.file ? { file: asset.file } : {}),
  }));
}
