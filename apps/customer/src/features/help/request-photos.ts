import type { ServiceRequest } from '@oneohm/api-contracts';
import { ApiError, NetworkError, type UploadableFile, uploadFile } from '@oneohm/mobile-ui';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL, currentToken } from '@/api/api';

export const MAX_REQUEST_PHOTOS = 6;

/** Opens the camera or the gallery; [] when cancelled, 'denied' without permission. */
export async function pickRequestPhotos(
  source: 'camera' | 'library',
  room: number,
): Promise<UploadableFile[] | 'denied'> {
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
    selectionLimit: Math.max(1, room),
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  const stamp = Date.now();
  return result.assets.slice(0, room).map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName ?? `problem-photo-${stamp}-${index + 1}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
    ...(asset.file ? { file: asset.file } : {}),
  }));
}

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A video on a weak signal needs longer than the usual two minutes. */
const MEDIA_TIMEOUT_MS = 10 * 60_000;

/**
 * Sends files to a request just raised: photos to `photos`, a video or voice note to
 * `files`. A file that fails for want of signal is tried again a few times; the number
 * that never got through is returned.
 */
export async function sendRequestPhotos(
  requestId: string,
  photos: readonly UploadableFile[],
  route: 'photos' | 'files' = 'photos',
): Promise<number> {
  let failed = 0;
  for (const file of photos) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await uploadFile<ServiceRequest>({
          url: `${API_BASE_URL.replace(/\/+$/, '')}/v1/customer/service-requests/${requestId}/${route}`,
          token: currentToken(),
          file,
          fields: {},
          ...(route === 'files' ? { timeoutMs: MEDIA_TIMEOUT_MS } : {}),
        });
        break;
      } catch (error) {
        const passing =
          error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
        const delay = RETRY_DELAYS_MS[attempt];
        if (!passing || delay === undefined) {
          failed += 1;
          break;
        }
        await wait(delay);
      }
    }
  }
  return failed;
}
