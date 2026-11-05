import { describe, expect, it } from 'vitest';
import { lookUpServerIp } from './payout-ip.service';

const answer = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('lookUpServerIp', () => {
  it('reads the ip', async () => {
    expect(await lookUpServerIp(answer({ ip: '203.0.113.7' }))).toBe('203.0.113.7');
  });
  it('is null on a bad answer, an error status or a network failure', async () => {
    expect(await lookUpServerIp(answer({ ip: '<script>' }))).toBeNull();
    expect(await lookUpServerIp(answer({}, 500))).toBeNull();
    expect(
      await lookUpServerIp((async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});
