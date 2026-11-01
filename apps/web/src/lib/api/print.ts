'use client';

import { documentUrl } from './upload';

/**
 * Prints one document without leaving the page: the file loads in a hidden frame on the
 * same origin and the browser's print dialog opens for it.
 */
export function printDocument(id: string): void {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  frame.src = documentUrl(id);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Keep the frame while the dialog is open; it is invisible either way.
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
