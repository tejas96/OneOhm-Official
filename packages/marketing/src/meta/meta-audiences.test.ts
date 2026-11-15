import { describe, expect, it } from 'vitest';
import { createMetaPlatform } from './meta-platform';
import { fakeGraph, metaAccess, metaApp, status } from './meta-test-kit';

describe('meta audiences', () => {
  it('creates a list, adds and removes people', async () => {
    const { fetch, calls } = fakeGraph({
      'POST act_123/customaudiences': { id: 'AUD1' },
      'POST AUD1/users': {},
    });
    const result = await createMetaPlatform(metaAccess(), metaApp(fetch)).syncAudience({
      kind: 'interested',
      externalId: null,
      add: ['h1', 'h2'],
      remove: ['h3'],
    });
    expect(result).toEqual({ externalId: 'AUD1', status: 'ready' });
    expect(calls[0]?.body).toMatchObject({
      name: 'OneOhm · Interested, not bought',
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    });
    expect(calls[1]?.body).toEqual({ payload: { schema: 'PHONE_SHA256', data: [['h1'], ['h2']] } });
    expect(calls[2]?.method).toBe('POST');
    expect(calls[2]?.body.method).toBe('DELETE');
    expect(JSON.parse(String(calls[2]?.body.payload))).toMatchObject({ data: [['h3']] });
  });

  it('uses the customers name and batches by 10 000', async () => {
    const { fetch, calls } = fakeGraph({
      'POST act_123/customaudiences': { id: 'AUD2' },
      'POST AUD2/users': {},
    });
    const add = Array.from({ length: 10001 }, (_, i) => `h${i}`);
    await createMetaPlatform(metaAccess(), metaApp(fetch)).syncAudience({
      kind: 'customers',
      externalId: null,
      add,
      remove: [],
    });
    expect(calls[0]?.body.name).toBe('OneOhm · Customers');
    expect(calls.slice(1).map((c) => (c.body.payload as { data: unknown[] }).data.length)).toEqual([
      10000, 1,
    ]);
  });

  it('reports the Custom Audience terms refusal as not allowed', async () => {
    const { fetch } = fakeGraph({
      'POST act_123/customaudiences': status(400, {
        error: { code: 2663, message: 'You must accept the Custom Audience Terms of Service' },
      }),
    });
    const result = await createMetaPlatform(metaAccess(), metaApp(fetch)).syncAudience({
      kind: 'customers',
      externalId: null,
      add: ['h'],
      remove: [],
    });
    expect(result).toEqual({
      externalId: null,
      status: 'not_allowed',
      error: "Accept Meta's Custom Audience terms once (Meta Ads Manager → Audiences).",
    });
  });

  it('fails other refusals with plain words', async () => {
    const { fetch } = fakeGraph({
      'POST AUD1/users': status(400, {
        error: { code: 100, message: 'x', error_user_msg: 'Bad data' },
      }),
    });
    const result = await createMetaPlatform(metaAccess(), metaApp(fetch)).syncAudience({
      kind: 'customers',
      externalId: 'AUD1',
      add: ['h'],
      remove: [],
    });
    expect(result).toEqual({ externalId: 'AUD1', status: 'failed', error: 'Bad data' });
  });

  it('waits on a lookalike until the seed has 100 people', async () => {
    const small = fakeGraph({ 'GET SEED': { approximate_count_lower_bound: 99 } });
    const platform = createMetaPlatform(metaAccess(), metaApp(small.fetch));
    expect(await platform.ensureLookalike('SEED', null)).toEqual({
      externalId: null,
      status: 'waiting',
    });
    expect(await platform.ensureLookalike('SEED', 'LAL')).toEqual({
      externalId: 'LAL',
      status: 'ready',
    });

    const big = fakeGraph({
      'GET SEED': { approximate_count_lower_bound: 100 },
      'POST act_123/customaudiences': { id: 'LAL2' },
    });
    const made = await createMetaPlatform(metaAccess(), metaApp(big.fetch)).ensureLookalike(
      'SEED',
      null,
    );
    expect(made).toEqual({ externalId: 'LAL2', status: 'ready' });
    expect(big.calls[1]?.body).toMatchObject({
      subtype: 'LOOKALIKE',
      origin_audience_id: 'SEED',
      lookalike_spec: { ratio: 0.01, country: 'IN' },
    });
  });

  it.each([
    ['auth', 190],
    ['rate', 17],
    ['temporary', 2],
  ])('rethrows a %s error', async (kind, code) => {
    const { fetch } = fakeGraph({
      'POST AUD1/users': status(400, { error: { code, message: 'nope' } }),
    });
    await expect(
      createMetaPlatform(metaAccess(), metaApp(fetch)).syncAudience({
        kind: 'customers',
        externalId: 'AUD1',
        add: ['h'],
        remove: [],
      }),
    ).rejects.toMatchObject({ kind });
  });
});
