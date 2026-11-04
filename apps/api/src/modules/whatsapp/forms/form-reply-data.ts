import type { EncryptionMetadata } from './media-decrypt';

/** The most files one "Send a paper" form takes (the flow allows 4). */
export const MAX_FORM_FILES = 4;

/**
 * A file in a form reply. Without an endpoint, WhatsApp posts each as an ordinary media id
 * (`id`); a form that talks to an endpoint gets `cdn_url` and the keys, so both are read.
 */
export type FormFile =
  | {
      readonly kind: 'media';
      readonly id: string;
      readonly fileName: string | null;
      readonly mimeType: string | null;
    }
  | {
      readonly kind: 'cdn';
      readonly id: string;
      readonly url: string;
      readonly fileName: string | null;
      readonly meta: EncryptionMetadata;
    };

/** What a customer sent back in a form (`nfm_reply`): our token and the files. */
export interface IncomingForm {
  readonly token: string | null;
  readonly files: readonly FormFile[];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const META_KEYS = ['encryption_key', 'hmac_key', 'iv', 'plaintext_hash', 'encrypted_hash'] as const;

function readFile(raw: unknown): FormFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const fileName = text(entry.file_name);
  const url = text(entry.cdn_url);
  const meta = entry.encryption_metadata as Record<string, unknown> | undefined;
  if (url) {
    if (!meta || META_KEYS.some((key) => !text(meta[key]))) return null;
    const id = text(entry.media_id) ?? text(entry.id) ?? text(meta.plaintext_hash) ?? url;
    return { kind: 'cdn', id, url, fileName, meta: meta as unknown as EncryptionMetadata };
  }
  const id = text(entry.id);
  return id ? { kind: 'media', id, fileName, mimeType: text(entry.mime_type) } : null;
}

/** The form reply in a message's `response_json` (a JSON string); an empty one when unreadable. */
export function readForm(responseJson: unknown): IncomingForm {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = typeof responseJson === 'string' ? JSON.parse(responseJson) : null;
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: no token and no files; the reply is told the form is old.
  }
  const list = Array.isArray(data.files) ? data.files : [];
  const files = list.flatMap((raw) => readFile(raw) ?? []).slice(0, MAX_FORM_FILES);
  return { token: text(data.flow_token), files };
}
