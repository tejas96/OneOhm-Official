/** WhatsApp refuses a text message longer than this. */
export const WHATSAPP_TEXT_LIMIT = 4096;

/**
 * The lines that fit in one WhatsApp message, whole lines from the top, then `more`
 * when some were left out, then the footer (which always fits).
 */
export function fitMessage(
  lines: readonly string[],
  footer: string,
  more: string,
  limit = WHATSAPP_TEXT_LIMIT,
): string {
  const room = limit - footer.length - more.length - 2;
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > room) break;
    kept.push(line);
    used += line.length + 1;
  }
  const rest = kept.length < lines.length ? [more] : [];
  return [...kept, ...rest, footer].join('\n');
}
