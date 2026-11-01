import { shrinkPhoto, type UploadableFile } from '@oneohm/mobile-ui';
import * as ImagePicker from 'expo-image-picker';
import { readLocation } from '@/features/attendance/location';
import { exifTakenAt, geotagFromExif } from '@/features/uploads/geotag';
import type { Geotag } from '@/features/uploads/queue-logic';

export type PhotoSource = 'camera' | 'library';

/** A picked photo and, when its EXIF has one, where it was taken. */
export interface PickedPhoto {
  readonly file: UploadableFile;
  readonly geotag: Geotag | null;
}

const MAX_PER_PICK = 6;

/**
 * Where and when a photo was taken (PRD 4.2). With location allowed (consent, working
 * hours), the camera's own EXIF position is used, or else the phone's position at the
 * moment of capture; without it only the time is kept. Gallery photos keep only what
 * their EXIF says, since where the phone is now is not where they were taken.
 */
async function tagOf(
  exif: unknown,
  source: PhotoSource,
  allowed: boolean,
  here: () => Promise<Geotag | null>,
): Promise<Geotag | null> {
  const fromExif = geotagFromExif(exif);
  const takenAt = exifTakenAt(exif) ?? (source === 'camera' ? new Date().toISOString() : null);
  if (!allowed)
    return takenAt ? { latitude: null, longitude: null, takenAt, source: 'exif' } : null;
  if (fromExif) return { ...fromExif, takenAt: fromExif.takenAt ?? takenAt, source: 'exif' };
  if (source === 'camera') return here();
  return takenAt ? { latitude: null, longitude: null, takenAt, source: 'exif' } : null;
}

/**
 * Asks for the camera or photo permission, then opens the camera or the gallery.
 * Resolves with the chosen photos ([] when cancelled) or 'denied'. EXIF is read for the
 * geotag where the phone gives it; the web preview opens the browser's file picker.
 * `locate`: location may be read now (consent given, working hours).
 */
export async function pickPhotos(
  source: PhotoSource,
  locate = false,
): Promise<PickedPhoto[] | 'denied'> {
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
  // One reading of the phone for the whole capture, only when it is needed.
  let reading: Promise<Geotag | null> | null = null;
  const here = () => {
    reading ??= readLocation().then((fix) =>
      fix && fix !== 'denied'
        ? { ...fix, takenAt: new Date().toISOString(), source: 'device' as const }
        : {
            latitude: null,
            longitude: null,
            takenAt: new Date().toISOString(),
            source: 'device' as const,
          },
    );
    return reading;
  };
  return Promise.all(
    result.assets.map(async (asset, index) => {
      // EXIF first: the resized copy (long edge 2000 px, JPEG 0.7) carries none.
      const geotag = await tagOf(asset.exif, source, locate, here);
      const picked: UploadableFile = {
        uri: asset.uri,
        name: asset.fileName ?? `site-photo-${stamp}-${index + 1}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
        ...(asset.file ? { file: asset.file } : {}),
      };
      return { file: await shrinkPhoto(picked, asset), geotag };
    }),
  );
}
