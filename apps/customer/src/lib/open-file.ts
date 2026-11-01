import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { API_BASE_URL, currentToken } from '@/api/api';

/**
 * Opens a protected file (a PDF or photo) without putting the token in a URL: the file
 * is fetched with the bearer header, saved to the cache and shown in the system viewer.
 * The web preview opens it in a new tab from memory instead.
 */
export async function openProtectedFile(
  path: string,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const token = currentToken();
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`The file answered ${response.status}.`);
    const href = URL.createObjectURL(await response.blob());
    globalThis.open?.(href, '_blank', 'noopener');
    return;
  }
  const target = new File(Paths.cache, safeName(fileName));
  const file = await File.downloadFileAsync(url, target, { headers, idempotent: true });
  if (await File.canPreview(file).catch(() => false)) {
    await File.preview(file, { title: fileName, mimeType });
    return;
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'oneohm-document';
}
