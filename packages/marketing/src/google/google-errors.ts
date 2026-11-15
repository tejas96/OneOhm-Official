import { PlatformError } from '../errors';

/** Google's replies are read field by field; their shape is documented, not typed here. */
// biome-ignore lint/suspicious/noExplicitAny: Google's JSON is read field by field.
export type GoogleJson = any;

const SIGNED_OUT = 'Google signed us out. Connect Google again.';
const TOKEN_PENDING = "Google is still approving OneOhm's developer token.";

const snake = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

/** Every `errorCode` Google named (the group, like AUTHORIZATION_ERROR, and the code itself). */
export function googleCodes(body: GoogleJson): string[] {
  const codes: string[] = [];
  const error = body?.error;
  if (typeof error === 'string') codes.push(error);
  if (typeof error?.status === 'string') codes.push(error.status);
  for (const detail of error?.details ?? []) {
    for (const item of detail?.errors ?? []) {
      for (const [group, code] of Object.entries(item?.errorCode ?? {})) {
        codes.push(snake(group), String(code));
      }
    }
  }
  return codes;
}

/** Google's own words for what went wrong. */
export function googleMessage(body: GoogleJson): string {
  const first = body?.error?.details?.[0]?.errors?.[0]?.message;
  const text = first ?? body?.error?.message ?? body?.error_description ?? '';
  return String(text).slice(0, 300);
}

/** True when the error says the developer token is not approved yet. */
export function isDeveloperTokenError(error: unknown): boolean {
  return error instanceof PlatformError && (error.detail ?? '').includes('DEVELOPER_TOKEN');
}

/** A `PlatformError` from a Google reply that was not OK. Never carries a token. */
export function googleApiError(status: number, body: GoogleJson): PlatformError {
  const codes = googleCodes(body);
  const has = (...wanted: string[]) => wanted.some((code) => codes.includes(code));
  const message = googleMessage(body);
  const detail = `${status} ${codes.join(', ')}${message ? ` - ${message}` : ''}`.trim();
  const fail = (kind: ConstructorParameters<typeof PlatformError>[0], words: string) =>
    new PlatformError(kind, words, detail);

  if (has('invalid_client'))
    return fail(
      'permission',
      "OneOhm's Google sign-in keys are wrong. Check GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET.",
    );
  if (has('DEVELOPER_TOKEN_NOT_APPROVED', 'DEVELOPER_TOKEN_PROHIBITED'))
    return fail('permission', TOKEN_PENDING);
  if (has('CONCURRENT_MODIFICATION'))
    return fail('temporary', 'Google was busy with another change. We will try again soon.');
  if (
    has('CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE') ||
    codes.some((c) => /CUSTOMER_MATCH/.test(c))
  )
    return fail('not_available', 'Google has not opened this feature for the account yet.');
  if (
    has('CUSTOMER_NOT_ENABLED') ||
    codes.some((c) => c !== 'CANCELLED' && /SUSPEND|CANCEL/.test(c))
  )
    return fail('account', 'The Google Ads account is not active. Check it in Google Ads.');
  if (has('USER_PERMISSION_DENIED'))
    return fail(
      'permission',
      'This Google login cannot use that ad account. Connect the right one.',
    );
  if (has('AUTHORIZATION_ERROR', 'PERMISSION_DENIED'))
    return fail(
      'permission',
      'Google did not allow this. Check the access of the connected login.',
    );
  if (
    has('invalid_grant', 'invalid_token', 'AUTHENTICATION_ERROR', 'UNAUTHENTICATED') ||
    status === 401
  )
    return fail('auth', SIGNED_OUT);
  if (has('QUOTA_ERROR', 'RESOURCE_EXHAUSTED', 'RESOURCE_TEMPORARILY_EXHAUSTED') || status === 429)
    return fail('rate', 'Google says too many requests. We will try again soon.');
  if (
    status >= 500 ||
    has('CANCELLED') ||
    has('UNAVAILABLE', 'INTERNAL', 'INTERNAL_ERROR', 'DEADLINE_EXCEEDED', 'TRANSIENT_ERROR')
  )
    return fail('temporary', 'Google is not answering right now. We will try again soon.');
  return fail('invalid', message || 'Google refused the request.');
}

/** The call never reached Google (no network, or it took too long). */
export function googleNetworkError(error: unknown): PlatformError {
  const detail = error instanceof Error ? error.message : String(error);
  return new PlatformError(
    'temporary',
    'Google is not answering right now. We will try again soon.',
    detail.slice(0, 200),
  );
}
