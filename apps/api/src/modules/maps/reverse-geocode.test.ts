import { describe, expect, it, vi } from 'vitest';
import { createReverseGeocode } from './reverse-geocode';

const body = {
  status: 'OK',
  results: [
    {
      address_components: [
        { long_name: 'Sangli', types: ['locality', 'political'] },
        { long_name: 'Sangli', types: ['administrative_area_level_2', 'political'] },
        { long_name: 'Vishrambag', types: ['sublocality_level_1', 'sublocality', 'political'] },
      ],
    },
  ],
};
type Call = (url: string, init: { signal: AbortSignal }) => Promise<Response>;
const ok = (json: unknown = body) => vi.fn<Call>(async () => Response.json(json));

describe('createReverseGeocode', () => {
  it('names the place and remembers it', async () => {
    const fetchImpl = ok();
    const lookup = createReverseGeocode({ shared: 'k' }, fetchImpl);
    const expected = { locality: 'Sangli', district: 'Sangli', sublocality: 'Vishrambag' };
    expect(await lookup(16.837, 74.596)).toEqual(expected);
    expect(await lookup(16.8371, 74.5961)).toEqual(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('key=k');
  });
  it('prefers the server key', async () => {
    const fetchImpl = ok();
    await createReverseGeocode({ server: 's', shared: 'k' }, fetchImpl)(1, 2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('key=s');
  });
  it('is null without a key and does not call out', async () => {
    const fetchImpl = ok();
    expect(await createReverseGeocode({ server: ' ' }, fetchImpl)(1, 2)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('is null on a non-200 answer or an error status', async () => {
    const down = vi.fn<Call>(async () => new Response('no', { status: 500 }));
    expect(await createReverseGeocode({ shared: 'k' }, down)(1, 2)).toBeNull();
    expect(
      await createReverseGeocode({ shared: 'k' }, ok({ status: 'REQUEST_DENIED' }))(1, 2),
    ).toBeNull();
  });
  it('is null on a timeout or a network error, and tries again next time', async () => {
    const fetchImpl = vi.fn<Call>(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const lookup = createReverseGeocode({ shared: 'k' }, fetchImpl);
    expect(await lookup(1, 2)).toBeNull();
    expect(await lookup(1, 2)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
