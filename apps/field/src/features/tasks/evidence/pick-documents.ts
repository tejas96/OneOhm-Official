import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import type { UploadableFile } from '@oneohm/mobile-ui';
import * as DocumentPicker from 'expo-document-picker';

const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

function typeOf(name: string, given: string | undefined): string {
  if (given && given !== 'application/octet-stream') return given;
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[extension] ?? 'application/pdf';
}

export interface PickedDocuments {
  readonly files: UploadableFile[];
  /** Names left out for being over the 25 MB limit. */
  readonly tooLarge: string[];
}

/**
 * Opens the phone's file picker for PDFs and images (bills, sanction letters, scanned
 * forms). Files over the upload limit are left out up front instead of failing later.
 */
export async function pickDocuments(): Promise<PickedDocuments> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { files: [], tooLarge: [] };
  const fits = result.assets.filter((asset) => (asset.size ?? 0) <= MAX_UPLOAD_BYTES);
  return {
    files: fits.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      type: typeOf(asset.name, asset.mimeType),
      ...(asset.file ? { file: asset.file } : {}),
    })),
    tooLarge: result.assets
      .filter((asset) => (asset.size ?? 0) > MAX_UPLOAD_BYTES)
      .map((asset) => asset.name),
  };
}
