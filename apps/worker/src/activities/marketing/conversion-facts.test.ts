import { describe, expect, it } from 'vitest';
import {
  type AdLeadFacts,
  afterFailedTry,
  bareLeadId,
  conversionsFor,
  isSetupGap,
  providersFor,
} from './conversion-facts';

const now = new Date('2026-11-15T10:00:00Z');
const base: AdLeadFacts = {
  stage: 'new',
  ctwaClid: null,
  fbclid: null,
  gclid: null,
  platformLeadId: null,
  campaignOnMeta: false,
  surveyBooked: false,
  surveyAt: null,
  quoteSentAt: null,
  quotedPaise: null,
  advance: null,
  wonAt: null,
  wonPaise: null,
  leadCreatedAt: new Date('2026-11-14T00:00:00Z'),
  leadUpdatedAt: new Date('2026-11-14T00:00:00Z'),
};

describe('conversion providers', () => {
  it('maps click ids and lead ids to platforms', () => {
    expect(providersFor({ ...base, ctwaClid: 'c' })).toEqual(['meta']);
    expect(providersFor({ ...base, fbclid: 'f' })).toEqual(['meta']);
    expect(providersFor({ ...base, platformLeadId: 'meta:1' })).toEqual(['meta']);
    expect(providersFor({ ...base, campaignOnMeta: true })).toEqual(['meta']);
    expect(providersFor({ ...base, gclid: 'g' })).toEqual(['google']);
    expect(providersFor({ ...base, platformLeadId: 'google:9' })).toEqual(['google']);
    expect(providersFor({ ...base, fbclid: 'f', gclid: 'g' })).toEqual(['meta', 'google']);
    expect(providersFor(base)).toEqual([]);
  });

  it('leaves a Meta campaign lead with a Google id to Google', () => {
    expect(providersFor({ ...base, campaignOnMeta: true, gclid: 'g' })).toEqual(['google']);
    expect(providersFor({ ...base, campaignOnMeta: true, platformLeadId: 'google:9' })).toEqual([
      'google',
    ]);
    expect(providersFor({ ...base, campaignOnMeta: true, fbclid: 'f', gclid: 'g' })).toEqual([
      'meta',
      'google',
    ]);
  });
});

describe('conversionsFor', () => {
  it('tells nothing for a lead with no platform', () => {
    expect(conversionsFor({ ...base, stage: 'won', wonAt: now }, now)).toEqual([]);
  });

  it('gives each reached step with its time and value', () => {
    const sent = new Date('2026-11-01T00:00:00Z');
    const paid = new Date('2026-11-05T00:00:00Z');
    const won = new Date('2026-11-06T00:00:00Z');
    const rows = conversionsFor(
      {
        ...base,
        gclid: 'g',
        stage: 'won',
        surveyBooked: true,
        surveyAt: new Date('2026-10-28T00:00:00Z'),
        quoteSentAt: sent,
        quotedPaise: 500_000,
        advance: { paidAt: paid, amountPaise: 100_000 },
        wonAt: won,
        wonPaise: 480_000,
      },
      now,
    );
    expect(rows.map((r) => [r.event, r.valuePaise, r.eventAt])).toEqual([
      ['survey', null, new Date('2026-10-28T00:00:00Z')],
      ['quoted', 500_000, sent],
      ['advance_paid', 100_000, paid],
      ['won', 480_000, won],
    ]);
  });

  it('uses now when no time is known, and never a future time', () => {
    const future = new Date('2026-12-01T00:00:00Z');
    const rows = conversionsFor(
      { ...base, ctwaClid: 'c', stage: 'survey_scheduled', surveyBooked: true, surveyAt: future },
      now,
    );
    expect(rows).toEqual([{ provider: 'meta', event: 'survey', eventAt: now, valuePaise: null }]);
  });

  it('gives an implied step the earliest time of the step that implies it', () => {
    const sent = new Date('2026-11-10T00:00:00Z');
    const won = new Date('2026-11-12T00:00:00Z');
    const rows = conversionsFor(
      { ...base, gclid: 'g', stage: 'won', quoteSentAt: sent, wonAt: won },
      now,
    );
    expect(rows.map((r) => [r.event, r.eventAt])).toEqual([
      ['survey', sent],
      ['quoted', sent],
      ['won', won],
    ]);
  });

  it("never uses now for an old lead: it takes the lead's own time", () => {
    const created = new Date('2026-09-01T00:00:00Z');
    const updated = new Date('2026-09-20T00:00:00Z');
    const rows = conversionsFor(
      {
        ...base,
        gclid: 'g',
        stage: 'quoted',
        leadCreatedAt: created,
        leadUpdatedAt: updated,
      },
      now,
    );
    expect(rows.map((r) => r.eventAt)).toEqual([updated, updated]);
  });

  it('makes a row per platform', () => {
    const rows = conversionsFor({ ...base, fbclid: 'f', gclid: 'g', stage: 'quoted' }, now);
    expect(rows.map((r) => `${r.provider}:${r.event}`)).toEqual([
      'meta:survey',
      'google:survey',
      'meta:quoted',
      'google:quoted',
    ]);
  });
});

describe('sending', () => {
  it('knows a setup gap from a step problem', () => {
    expect(isSetupGap('No Conversions API dataset yet')).toBe(true);
    expect(isSetupGap('Google conversion steps are not set up yet')).toBe(true);
    expect(isSetupGap('Too recent')).toBe(false);
  });

  it('does not count a try for a setup gap', () => {
    expect(afterFailedTry(2, 'wait', false, true)).toEqual({
      status: 'pending',
      attempts: 2,
      lastError: 'wait',
    });
  });

  it('strips the platform prefix', () => {
    expect(bareLeadId('meta:123')).toBe('123');
    expect(bareLeadId('google:abc')).toBe('abc');
    expect(bareLeadId(null)).toBeNull();
  });

  it('counts tries and gives up at five', () => {
    expect(afterFailedTry(0, 'slow', false)).toEqual({
      status: 'pending',
      attempts: 1,
      lastError: 'slow',
    });
    expect(afterFailedTry(4, 'slow', false).status).toBe('failed');
    expect(afterFailedTry(0, 'bad', true).status).toBe('failed');
  });
});
