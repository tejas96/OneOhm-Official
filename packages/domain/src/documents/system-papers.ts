import type { DocumentCategory } from './document-categories';

/**
 * Papers OneOhm prints itself and files in the documents by itself (PRD 3.14): the
 * accepted quotation, tax invoices, receipts and work orders. Each is filed once per
 * version, so a cancelled invoice or a changed work order replaces the earlier copy.
 */
export const SYSTEM_PAPER_KINDS = ['quotation', 'invoice', 'receipt', 'work_order'] as const;
export type SystemPaperKind = (typeof SYSTEM_PAPER_KINDS)[number];

export const SYSTEM_PAPER_CATEGORY: Readonly<Record<SystemPaperKind, DocumentCategory>> = {
  quotation: 'quotation',
  invoice: 'invoice_receipt',
  receipt: 'invoice_receipt',
  // Work orders carry contractor rates, so they are never in a customer-facing folder.
  work_order: 'contractor',
};

const PREFIX = 'system';
const SAFE = /^[A-Za-z0-9_-]+$/;

/** Where a paper's PDF is stored: `system/<kind>/<source id>/<version>.pdf`. */
export function systemPaperKey(kind: SystemPaperKind, sourceId: string, version: string): string {
  if (!SAFE.test(sourceId) || !SAFE.test(version)) throw new Error('Unsafe system paper key.');
  return `${PREFIX}/${kind}/${sourceId}/${version}.pdf`;
}

export interface SystemPaperRef {
  readonly kind: SystemPaperKind;
  readonly sourceId: string;
  readonly version: string;
}

/** The paper a stored key belongs to, or null for any other file. */
export function readSystemPaperKey(key: string): SystemPaperRef | null {
  const match = /^system\/([a-z_]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\.pdf$/.exec(key);
  if (!match) return null;
  const [, kind, sourceId, version] = match;
  if (!kind || !sourceId || !version) return null;
  if (!(SYSTEM_PAPER_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as SystemPaperKind, sourceId, version };
}

/** File it (none on file), file it again (a new version) or leave it. */
export function systemPaperAction(
  filedKey: string | null,
  wantedKey: string,
): 'file' | 'refile' | 'keep' {
  if (filedKey === null) return 'file';
  return filedKey === wantedKey ? 'keep' : 'refile';
}

/** A short, stable version from the parts a printed paper shows (a plain string hash). */
export function paperVersion(parts: readonly (string | number | null | undefined)[]): string {
  const text = parts.map((part) => (part === null || part === undefined ? '' : String(part)));
  let hash = 5381;
  for (const char of text.join('|')) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}
