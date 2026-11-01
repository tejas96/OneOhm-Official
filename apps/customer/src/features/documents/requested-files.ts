import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { shrinkPhoto, type UploadableFile, uploadFile } from '@oneohm/mobile-ui';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL, currentToken } from '@/api/api';

export type FileSource = 'camera' | 'library' | 'file';

/** One photo or PDF for a paper OneOhm asked for; null when cancelled. */
export async function pickRequestedFile(
  source: FileSource,
): Promise<UploadableFile | null | 'denied'> {
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return null;
    return {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? 'application/pdf',
      ...(asset.file ? { file: asset.file } : {}),
    };
  }
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  // A photo of a paper still reads clearly at 2000 px; much quicker to send.
  return shrinkPhoto(
    {
      uri: asset.uri,
      name: asset.fileName ?? `paper-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
      ...(asset.file ? { file: asset.file } : {}),
    },
    asset,
  );
}

/** Sends the file; OneOhm files it with the project and the request closes. */
export function sendRequestedFile(
  requestId: string,
  file: UploadableFile,
): Promise<CustomerDocumentRequest> {
  return uploadFile<CustomerDocumentRequest>({
    url: `${API_BASE_URL.replace(/\/+$/, '')}/v1/customer/document-requests/${requestId}/file`,
    token: currentToken(),
    file,
    fields: {},
  });
}
