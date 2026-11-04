import { createHmac, timingSafeEqual } from 'node:crypto';
import { readOther } from './incoming-other';

/** Meta signs each webhook post: `sha256=` and the HMAC of the raw body with the app secret. */
export function verifyMetaSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice('sha256='.length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Who may post to the webhook. With the app secret, every post must carry Meta's
 * signature. Until the secret is known, a long random key in the URL stands in: it is
 * weaker (anyone holding the link could post), so the secret always wins once set.
 */
export function webhookAccess(
  settings: { readonly appSecret?: string | undefined; readonly pathKey?: string | undefined },
  request: {
    readonly key?: string | undefined;
    readonly rawBody?: Buffer | undefined;
    readonly signature?: string | undefined;
  },
): 'ok' | 'not_found' | 'bad_signature' {
  if (settings.appSecret) {
    if (!request.rawBody) return 'bad_signature';
    return verifyMetaSignature(request.rawBody, request.signature, settings.appSecret)
      ? 'ok'
      : 'bad_signature';
  }
  if (settings.pathKey && request.key && sameText(settings.pathKey, request.key)) return 'ok';
  return 'not_found';
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A photo, paper, video or voice note the customer sent; WhatsApp keeps it under `id`. */
export interface IncomingMedia {
  readonly type: 'image' | 'document' | 'video' | 'audio';
  readonly id: string;
  readonly mimeType: string | null;
  readonly fileName: string | null;
}

export interface Incoming {
  readonly from: string;
  readonly waMessageId: string;
  readonly at: Date;
  readonly profileName: string | null;
  /** `choice` is a tap on a button or list row; its id is in `choiceId`. */
  readonly kind: 'text' | 'choice' | 'media' | 'other';
  readonly text: string;
  readonly choiceId: string | null;
  /** Set on `media` messages that carry a downloadable file. */
  readonly media?: IncomingMedia | null;
  /** Set on a message the chat shows but nobody is alerted to (a reaction). */
  readonly quiet?: boolean;
  /** Set when the chat was opened from a Meta click-to-WhatsApp ad. */
  readonly referral?: IncomingReferral | null;
}

/** The ad behind a click-to-WhatsApp message. */
export interface IncomingReferral {
  readonly sourceId: string | null;
  readonly sourceUrl: string | null;
  readonly headline: string | null;
}

export interface DeliveryUpdate {
  readonly providerMessageId: string;
  readonly status: 'sent' | 'delivered' | 'read' | 'failed';
  readonly at: Date;
  readonly error: string | null;
  /** Meta's error code on a failed receipt (131026: not on WhatsApp). */
  readonly errorCode: number | null;
}

interface RawMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  button?: { payload?: string; text?: string };
  image?: RawMedia;
  document?: RawMedia & { filename?: string };
  video?: RawMedia;
  audio?: RawMedia;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  reaction?: { emoji?: string };
  referral?: { source_id?: string; source_url?: string; headline?: string };
}

interface RawMedia {
  id?: string;
  mime_type?: string;
  caption?: string;
}

const MEDIA_TYPES = ['image', 'document', 'video', 'audio'] as const;

/** The file in a photo, paper, video or voice-note message, or null for anything else. */
export function readMedia(message: RawMessage): IncomingMedia | null {
  const type = MEDIA_TYPES.find((name) => name === message.type);
  const raw = type ? message[type] : undefined;
  if (!type || !raw?.id) return null;
  return {
    type,
    id: raw.id,
    mimeType: raw.mime_type ?? null,
    fileName: (type === 'document' ? message.document?.filename : undefined) ?? null,
  };
}

interface RawStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { title?: string; message?: string; code?: number }[];
}

interface RawValue {
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: RawMessage[];
  statuses?: RawStatus[];
}

const when = (seconds: string | undefined) =>
  new Date(seconds ? Number(seconds) * 1000 : Date.now());

/** The ad a click-to-WhatsApp message came from, or null for an ordinary message. */
function readReferral(message: RawMessage): IncomingReferral | null {
  const raw = message.referral;
  if (!raw) return null;
  return {
    sourceId: raw.source_id ?? null,
    sourceUrl: raw.source_url ?? null,
    headline: raw.headline ?? null,
  };
}

function readMessage(message: RawMessage, names: Map<string, string>): Incoming | null {
  if (!message.from || !message.id) return null;
  const base = {
    referral: readReferral(message),
    from: `+${message.from.replace(/^\+/, '')}`,
    waMessageId: message.id,
    at: when(message.timestamp),
    profileName: names.get(message.from) ?? null,
  };
  const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
  if (reply?.id)
    return { ...base, kind: 'choice', text: reply.title ?? reply.id, choiceId: reply.id };
  if (message.button?.payload)
    return {
      ...base,
      kind: 'choice',
      text: message.button.text ?? '',
      choiceId: message.button.payload,
    };
  if (message.type === 'text')
    return { ...base, kind: 'text', text: message.text?.body?.trim() ?? '', choiceId: null };
  const media = readMedia(message);
  if (media)
    return {
      ...base,
      kind: 'media',
      text: (
        message.image?.caption ??
        message.video?.caption ??
        message.document?.caption ??
        message.document?.filename ??
        ''
      ).trim(),
      choiceId: null,
      media,
    };
  return {
    ...base,
    kind: 'other',
    text: readOther(message),
    choiceId: null,
    ...(message.type === 'reaction' ? { quiet: true } : {}),
  };
}

const STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

function readStatus(status: RawStatus): DeliveryUpdate | null {
  if (!status.id || !status.status || !STATUSES.has(status.status)) return null;
  const error = status.errors?.[0];
  return {
    providerMessageId: status.id,
    status: status.status as DeliveryUpdate['status'],
    at: when(status.timestamp),
    error: error ? `${error.code ?? ''} ${error.title ?? error.message ?? ''}`.trim() : null,
    errorCode: error?.code ?? null,
  };
}

/** The messages and delivery receipts in one webhook post; anything else is skipped. */
export function readWebhook(body: unknown): { incoming: Incoming[]; updates: DeliveryUpdate[] } {
  const incoming: Incoming[] = [];
  const updates: DeliveryUpdate[] = [];
  const entries = (body as { entry?: { changes?: { value?: RawValue }[] }[] }).entry ?? [];
  for (const change of entries.flatMap((entry) => entry.changes ?? [])) {
    const value = change.value ?? {};
    const names = new Map(
      (value.contacts ?? []).flatMap((contact) =>
        contact.wa_id && contact.profile?.name ? [[contact.wa_id, contact.profile.name]] : [],
      ) as [string, string][],
    );
    for (const message of value.messages ?? []) {
      const read = readMessage(message, names);
      if (read) incoming.push(read);
    }
    for (const status of value.statuses ?? []) {
      const update = readStatus(status);
      if (update) updates.push(update);
    }
  }
  return { incoming, updates };
}
