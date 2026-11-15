import { describe, expect, it } from 'vitest';
import { withAdLinks } from './entry-ads';
import { entryOf } from './entry-capture';

/** A database whose every select ends with the next prepared answer. */
const db = (...answers: object[][]) => {
  const rest = [...answers];
  const chain: Record<string, unknown> = {};
  for (const name of ['from', 'innerJoin', 'leftJoin', 'where']) chain[name] = () => chain;
  chain.limit = async () => rest.shift() ?? [];
  return { select: () => chain } as never;
};
const text = (body: string, referral: object | null = null) =>
  ({ kind: 'text', text: body, referral }) as never;

describe('click-to-WhatsApp entry', () => {
  it('carries Meta click id and the ad', () => {
    const entry = entryOf(
      text('Hi', { sourceId: 'ad-9', sourceUrl: null, headline: 'Solar', ctwaClid: 'clid-1' }),
    );
    expect(entry).toMatchObject({ adId: 'ad-9', ctwaClid: 'clid-1' });
  });

  it('finds our campaign code from the ad id when the text names none', async () => {
    const incoming = text('Hi', {
      sourceId: 'ad-9',
      sourceUrl: null,
      headline: null,
      ctwaClid: null,
    });
    const linked = await withAdLinks(db([{ code: 'DIWALI26' }]), entryOf(incoming) ?? {}, incoming);
    expect(linked.campaignCode).toBe('DIWALI26');
  });

  it('keeps a code the text already named', async () => {
    const incoming = text('Hi OneOhm POSTER-1', {
      sourceId: 'ad-9',
      sourceUrl: null,
      headline: null,
      ctwaClid: null,
    });
    const linked = await withAdLinks(db(), entryOf(incoming) ?? {}, incoming);
    expect(linked.campaignCode).toBe('POSTER-1');
  });

  it('adds the Google click of a landing-page opener', async () => {
    const incoming = text('Hi OneOhm SOLAR-01 #k3f9q2');
    const linked = await withAdLinks(
      db([{ id: 'click-1', gclid: 'G-77', fbclid: null, code: 'SOLAR-01' }]),
      entryOf(incoming) ?? {},
      incoming,
    );
    expect(linked).toMatchObject({ campaignCode: 'SOLAR-01', gclid: 'G-77', clickId: 'click-1' });
    expect(linked.fbclid).toBeUndefined();
  });

  it('ignores a visit when the message names no campaign code', async () => {
    const incoming = text('Hi OneOhm #k3f9q2');
    const linked = await withAdLinks(
      db([{ id: 'click-1', gclid: 'G-77', fbclid: null, code: 'SOLAR-01' }]),
      entryOf(incoming) ?? {},
      incoming,
    );
    expect(linked.clickId).toBeUndefined();
    expect(linked.gclid).toBeUndefined();
  });
});
