'use client';

import { networkError, toApiError } from './api-error';
import { CSRF_COOKIE, CSRF_HEADER } from './contract';

function csrfToken(): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Asks for several documents as one ZIP (saved) or one PDF (opened in a new tab for
 * printing). Same origin, cookie session and CSRF header as every other call.
 */
export async function downloadBundle(
  ids: readonly string[],
  format: 'zip' | 'pdf',
  name: string,
): Promise<void> {
  const token = csrfToken();
  let response: Response;
  try {
    response = await fetch(`/api/v1/documents/bundle/${format}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(token ? { [CSRF_HEADER]: token } : {}) },
      body: JSON.stringify({ ids, name }),
    });
  } catch {
    throw networkError();
  }
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
  const url = URL.createObjectURL(await response.blob());
  if (format === 'pdf') {
    window.open(url, '_blank', 'noopener');
  } else {
    const link = Object.assign(document.createElement('a'), { href: url, download: `${name}.zip` });
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
