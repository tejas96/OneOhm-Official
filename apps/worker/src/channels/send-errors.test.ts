import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { MAYBE_SENT, metaSendFailure, PermanentSendError, whenNoAnswer } from './send-errors';
import { createWhatsAppSender } from './whatsapp-cloud';

const meta = (code: number, message = 'refused') => ({ code, message });

describe('metaSendFailure', () => {
  it.each([130429, 131056, 131048, 131000])('retries Meta code %i even on a 400', (code) => {
    const error = metaSendFailure(400, meta(code));
    expect(error).not.toBeInstanceOf(PermanentSendError);
    expect(error.message).toContain('WhatsApp 400');
  });

  it('retries rate limits and server errors without a code', () => {
    expect(metaSendFailure(429, undefined)).not.toBeInstanceOf(PermanentSendError);
    expect(metaSendFailure(503, undefined)).not.toBeInstanceOf(PermanentSendError);
  });

  it('treats an invalid token (code 190 or a 401) as permanent and flags it', () => {
    for (const error of [metaSendFailure(400, meta(190)), metaSendFailure(401, undefined)]) {
      expect(error).toBeInstanceOf(PermanentSendError);
      expect((error as PermanentSendError).tokenInvalid).toBe(true);
    }
  });

  it('keeps "not on WhatsApp" permanent with its code, for the SMS fallback', () => {
    const error = metaSendFailure(400, meta(131026));
    expect(error).toBeInstanceOf(PermanentSendError);
    expect((error as PermanentSendError).code).toBe(131026);
    expect((error as PermanentSendError).tokenInvalid).toBe(false);
  });

  it('does not retry other client errors', () => {
    expect(metaSendFailure(400, meta(132001))).toBeInstanceOf(PermanentSendError);
  });
});

describe('whenNoAnswer', () => {
  it('never retries a timeout or abort: the message may have gone', () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const error = whenNoAnswer(new DOMException('took too long', name));
      expect(error).toBeInstanceOf(PermanentSendError);
      expect(error.message).toBe(MAYBE_SENT);
    }
    expect(MAYBE_SENT).toContain('may have been sent — check before resending');
  });

  it('retries a network error before any answer, such as a refused connection', () => {
    const error = whenNoAnswer(new TypeError('fetch failed'));
    expect(error).not.toBeInstanceOf(PermanentSendError);
    expect(error.message).toBe('fetch failed');
  });
});

describe('live sender errors', () => {
  const config = loadConfig({
    WHATSAPP_DELIVERY: 'live',
    WHATSAPP_ACCESS_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '1',
    DATABASE_URL: 'postgres://x',
  });
  const withFetch = async (fake: typeof fetch, run: () => Promise<void>) => {
    const original = globalThis.fetch;
    globalThis.fetch = fake;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  };
  const hi = { kind: 'text', body: 'hi' } as const;

  it('turns a timeout after the POST into a failure that is not retried', async () => {
    await withFetch(
      (async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }) as typeof fetch,
      async () => {
        const sending = createWhatsAppSender(config, () => {}).sendSession('+919800000000', hi);
        await expect(sending).rejects.toBeInstanceOf(PermanentSendError);
        await expect(sending).rejects.toThrow(MAYBE_SENT);
      },
    );
  });

  it('retries a Meta rate limit sent back as a 400', async () => {
    await withFetch(
      (async () =>
        new Response(JSON.stringify({ error: meta(130429, 'Rate limit hit') }), {
          status: 400,
        })) as typeof fetch,
      async () => {
        const error = await createWhatsAppSender(config, () => {})
          .sendSession('+919800000000', hi)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(PermanentSendError);
      },
    );
  });
});
