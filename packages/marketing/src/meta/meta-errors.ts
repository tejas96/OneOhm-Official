import { PlatformError, type PlatformErrorKind } from '../errors';

interface MetaErrorBody {
  readonly message?: string;
  readonly code?: number;
  readonly error_subcode?: number;
  readonly error_user_msg?: string;
  readonly error_user_title?: string;
  readonly fbtrace_id?: string;
}

/** Tokens never go into an error: cut anything that looks like one. */
export function redact(text: string): string {
  return text
    .replace(/(access_token|appsecret_proof|client_secret|fb_exchange_token)=[^&\s"]+/g, '$1=…')
    .replace(/\bEA[A-Za-z0-9]{20,}/g, '…');
}

const PERMISSION_NAMES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'pages_manage_posts',
  'pages_messaging',
  'leads_retrieval',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'whatsapp_business_management',
];

const ACCOUNT_SUBCODES = new Set([1487390, 1487225, 1815694, 1359188]);
/** Rate limits that arrive with a generic code (2446079: too many calls for this ad account). */
const RATE_SUBCODES = new Set([2446079]);
const ACCOUNT_WORDS = /ad account.*(disabled|closed|restricted|unsettled)|account (is )?disabled/i;

function kindOf(
  status: number,
  code: number | undefined,
  subcode: number | undefined,
  text: string,
) {
  if (
    (subcode && RATE_SUBCODES.has(subcode)) ||
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    (code !== undefined && code >= 80000 && code <= 80014)
  ) {
    return 'rate';
  }
  if ((subcode && ACCOUNT_SUBCODES.has(subcode)) || ACCOUNT_WORDS.test(text)) return 'account';
  if (code === 190 || code === 102) return 'auth';
  if (code === 10 || code === 3 || (code !== undefined && code >= 200 && code <= 299)) {
    return 'permission';
  }
  if (code === 1 || code === 2 || status >= 500) return 'temporary';
  return 'invalid';
}

function plainWords(kind: PlatformErrorKind, text: string, userMessage: string): string {
  if (kind === 'auth') return 'Meta signed us out. Connect Meta again.';
  if (kind === 'rate') return 'Meta says too many requests. Try again in a few minutes.';
  if (kind === 'temporary') return 'Meta is having trouble right now. Try again in a minute.';
  if (kind === 'account') {
    return 'Meta has stopped this ad account (disabled or unpaid). Open Meta Ads Manager to fix it.';
  }
  if (kind === 'permission') {
    const missing = PERMISSION_NAMES.filter((name) => text.includes(name));
    return missing.length > 0
      ? `Meta needs this permission before we can do that: ${missing.join(', ')}. Connect Meta again and allow it.`
      : 'Meta did not allow that. Connect Meta again and allow every permission.';
  }
  return userMessage;
}

/** Turns Meta's refusal into a `PlatformError` with plain words and Meta's own detail. */
export function graphError(status: number, body: unknown): PlatformError {
  const error = ((body as { error?: MetaErrorBody } | null)?.error ?? {}) as MetaErrorBody;
  const raw = error.message ?? `HTTP ${status}`;
  const userMessage = error.error_user_msg ?? raw;
  const text = `${raw} ${userMessage}`;
  const kind = kindOf(status, error.code, error.error_subcode, text);
  const parts = [
    `code ${error.code ?? status}`,
    error.error_subcode ? `subcode ${error.error_subcode}` : null,
    error.fbtrace_id ? `trace ${error.fbtrace_id}` : null,
  ].filter(Boolean);
  const extra = [error.error_user_title, error.error_user_msg].filter(Boolean);
  const detail = redact([`${parts.join(' ')}: ${raw}`, ...extra].join(' | '));
  return new PlatformError(kind, redact(plainWords(kind, text, userMessage)), detail);
}

/** The subcode Meta gave, for the few places that react to one. */
export function subcodeOf(body: unknown): number | undefined {
  return (body as { error?: MetaErrorBody } | null)?.error?.error_subcode;
}
