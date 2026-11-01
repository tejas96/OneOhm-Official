import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { API_BASE_URL, currentToken } from '@/api/api';

export type FileAction = 'open' | 'share';

function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'oneohm-document';
}

/** The web preview: open in a new tab, or save it as a download to share from there. */
async function onWeb(
  url: string,
  headers: Record<string, string>,
  fileName: string,
  action: FileAction,
) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`The file answered ${response.status}.`);
  const href = URL.createObjectURL(await response.blob());
  if (action === 'open') {
    globalThis.open?.(href, '_blank', 'noopener');
    return;
  }
  const link = document.createElement('a');
  link.href = href;
  link.download = safeName(fileName);
  link.click();
}

/**
 * Opens or shares a protected file (a quotation PDF) without putting the token in a
 * URL: it is fetched with the bearer header and saved to the cache, then shown in the
 * system viewer or handed to the share sheet (WhatsApp, email, Files).
 */
export async function openProtectedFile(
  path: string,
  fileName: string,
  mimeType: string,
  action: FileAction = 'open',
): Promise<void> {
  const token = currentToken();
  const url = `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (Platform.OS === 'web') {
    await onWeb(url, headers, fileName, action);
    return;
  }
  const target = new File(Paths.cache, safeName(fileName));
  const file = await File.downloadFileAsync(url, target, { headers, idempotent: true });
  if (action === 'open' && (await File.canPreview(file).catch(() => false))) {
    await File.preview(file, { title: fileName, mimeType });
    return;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: fileName,
    ...(mimeType === 'application/pdf' ? { UTI: 'com.adobe.pdf' } : {}),
  });
}
