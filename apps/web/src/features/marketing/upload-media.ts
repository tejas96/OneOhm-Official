'use client';

import type { MarketingMedia } from '@oneohm/api-contracts';
import { networkError, toApiError } from '@/lib/api/api-error';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/api/contract';

function csrfToken(): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Sends one campaign photo or video with progress (fetch cannot report upload progress, so
 * this uses XMLHttpRequest, like the document upload). Cookie session and CSRF header as
 * every other call. `onProgress` gets 0 to 1.
 */
export function uploadMarketingMedia(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<MarketingMedia> {
  const form = new FormData();
  form.append('file', file, file.name);
  return new Promise<MarketingMedia>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/v1/marketing/media');
    request.withCredentials = true;
    const token = csrfToken();
    if (token) request.setRequestHeader(CSRF_HEADER, token);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(networkError());
    request.onload = () => {
      let body: unknown = null;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        body = null;
      }
      if (request.status === 201) {
        resolve(body as MarketingMedia);
        return;
      }
      if (request.status === 401) {
        window.location.assign(
          `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
      }
      reject(toApiError(request.status, body));
    };
    request.send(form);
  });
}

/** The kinds of file the drop zone takes. */
export const MEDIA_ACCEPT = 'image/*,video/mp4,video/quicktime,.mp4,.mov';

/** Whether a picked file is a photo or a video we take; null otherwise. */
export function mediaKindOfFile(file: Pick<File, 'type' | 'name'>): 'image' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'video/mp4' || file.type === 'video/quicktime') return 'video';
  return /\.(mp4|mov)$/i.test(file.name) ? 'video' : null;
}
