import { describe, expect, it } from 'vitest';
import { PlatformError } from '../errors';
import { graphError } from './meta-errors';
import { createGraph } from './meta-graph';
import { fakeGraph, status } from './meta-test-kit';

const err = (code: number, extra: Record<string, unknown> = {}, http = 400) =>
  graphError(http, { error: { code, message: `msg ${code}`, fbtrace_id: 'TR', ...extra } });

describe('meta error mapping', () => {
  it('maps codes to kinds', () => {
    expect(err(190)).toMatchObject({
      kind: 'auth',
      message: 'Meta signed us out. Connect Meta again.',
    });
    expect(err(102).kind).toBe('auth');
    expect(err(17).kind).toBe('rate');
    expect(err(80004).kind).toBe('rate');
    expect(err(200, { message: '(#200) Requires ads_management permission' }).kind).toBe(
      'permission',
    );
    expect(err(200, { message: '(#200) Requires ads_management permission' }).message).toContain(
      'ads_management',
    );
    expect(err(10).kind).toBe('permission');
    expect(err(2).kind).toBe('temporary');
    expect(err(0, {}, 503).kind).toBe('temporary');
    expect(err(100, { error_subcode: 1487390 }).kind).toBe('account');
    expect(err(100, { message: 'The ad account is disabled' }).kind).toBe('account');
  });

  it("uses Meta's user message for invalid and keeps the detail without tokens", () => {
    const e = err(100, {
      error_user_msg: 'Your text is too long',
      error_subcode: 33,
      message: 'bad access_token=EAAB123456789012345678901234',
    });
    expect(e).toMatchObject({ kind: 'invalid', message: 'Your text is too long' });
    expect(e.detail).toContain('code 100');
    expect(e.detail).toContain('subcode 33');
    expect(e.detail).toContain('trace TR');
    expect(e.detail).not.toContain('EAAB');
  });

  it('maps through the http helper, including network failures', async () => {
    const { fetch } = fakeGraph({
      'GET me': status(400, { error: { code: 190, message: 'expired' } }),
    });
    const graph = createGraph({ fetch, version: 'v26.0', token: 't', appSecret: 's' });
    await expect(graph.get('me')).rejects.toMatchObject({ kind: 'auth' });
    const down = createGraph({
      fetch: (async () => {
        throw new Error('offline');
      }) as typeof fetch,
      version: 'v26.0',
      token: 't',
    });
    const failure = (await down.get('me').catch((e: unknown) => e)) as PlatformError;
    expect(failure).toBeInstanceOf(PlatformError);
    expect(failure.kind).toBe('temporary');
  });

  it('treats rate limit codes as rate before account problems', () => {
    expect(err(100, { error_subcode: 2446079 }).kind).toBe('rate');
    expect(err(80004, { error_subcode: 1487390 }).kind).toBe('rate');
    expect(err(100, { error_subcode: 1487390 }).kind).toBe('account');
  });
});
