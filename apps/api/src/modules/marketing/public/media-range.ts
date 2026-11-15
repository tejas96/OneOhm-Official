/** One plain byte range ("bytes=0-1023", "bytes=500-", "bytes=-500"); anything else is ignored. */
export function byteRange(header: string | undefined): string | undefined {
  return header && /^bytes=(\d+-\d*|-\d+)$/.test(header.trim()) ? header.trim() : undefined;
}

export const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
