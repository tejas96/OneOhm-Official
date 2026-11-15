import { describe, expect, it } from 'vitest';
import { readyPlaces } from './campaign-defaults';
import { fillDays } from './campaign-detail.read';
import { NO_NUMBERS, numbersOf, wonValueByLead } from './campaign-numbers';
import { campaignStateAfter } from './campaign-run';
import { type AlertCampaign, type AlertConnection, buildAlerts } from './overview-alerts';

describe('campaign numbers', () => {
  it('divides spend by leads and sales, and leaves nulls when there are none', () => {
    expect(numbersOf({ ...NO_NUMBERS, spentPaise: 1_000_00, leads: 8, sales: 2 })).toMatchObject({
      costPerLeadPaise: 12_500,
      costPerSalePaise: 50_000,
    });
    expect(numbersOf({ ...NO_NUMBERS, spentPaise: 500 })).toMatchObject({
      costPerLeadPaise: null,
      costPerSalePaise: null,
    });
  });

  it('counts a quotation chain once, at its latest accepted revision', () => {
    const value = wonValueByLead([
      { leadId: 'l1', number: 'Q-1', revision: 1, totalPaise: 100 },
      { leadId: 'l1', number: 'Q-1', revision: 2, totalPaise: 120 },
      { leadId: 'l2', number: 'Q-2', revision: 1, totalPaise: 50 },
    ]);
    expect(value.get('l1')).toBe(120);
    expect(value.get('l2')).toBe(50);
  });

  it('fills 30 days with zeros where nothing happened', () => {
    const days = fillDays(
      '2026-11-15',
      new Map([['2026-11-15', 500]]),
      new Map([['2026-11-01', 2]]),
    );
    expect(days).toHaveLength(30);
    expect(days[0]?.day).toBe('2026-10-17');
    expect(days.at(-1)).toEqual({ day: '2026-11-15', spentPaise: 500, leads: 0 });
    expect(days.find((day) => day.day === '2026-11-01')?.leads).toBe(2);
  });
});

describe('alerts', () => {
  const now = new Date('2026-11-15T06:00:00Z');
  const live = (
    spend: [string, number][],
    leadsInWindow: number,
    state = 'live',
  ): AlertCampaign => ({
    id: 'c1',
    name: 'Diwali offer',
    state,
    placements: [{ state: 'live', error: null }],
    spendByDay: new Map(spend),
    leadsInWindow,
  });
  const days = ['2026-11-13', '2026-11-14'];
  const run = (campaigns: AlertCampaign[], connections: AlertConnection[] = []) =>
    buildAlerts({ now, lowBalancePaise: 100_000, connections, campaigns, days });

  it('warns when money was spent on every day and no lead came', () => {
    const alerts = run([
      live(
        [
          ['2026-11-13', 30_000],
          ['2026-11-14', 20_000],
        ],
        0,
      ),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'no_leads', campaignId: 'c1' });
    expect(alerts[0]?.body).toBe(
      'Diwali offer spent ₹500 in 2 days with no leads. Try a new photo or pause it.',
    );
  });

  it('stays quiet with a lead, a day without spend, or a campaign that is not live', () => {
    expect(
      run([
        live(
          [
            ['2026-11-13', 30_000],
            ['2026-11-14', 20_000],
          ],
          1,
        ),
      ]),
    ).toEqual([]);
    expect(run([live([['2026-11-13', 30_000]], 0)])).toEqual([]);
    expect(
      run([
        live(
          [
            ['2026-11-13', 30_000],
            ['2026-11-14', 20_000],
          ],
          0,
          'paused',
        ),
      ]),
    ).toEqual([]);
  });

  it('asks to reconnect on a broken or soon-ending sign-in, and to top up a low balance', () => {
    const alerts = run(
      [],
      [
        {
          provider: 'meta',
          status: 'needs_attention',
          accountId: 'act_1',
          tokenExpiresAt: null,
          balancePaise: null,
        },
        {
          provider: 'google',
          status: 'connected',
          accountId: '123',
          tokenExpiresAt: new Date('2026-11-18T00:00:00Z'),
          balancePaise: 50_000,
        },
      ],
    );
    expect(alerts.map((alert) => [alert.kind, alert.title])).toEqual([
      ['reconnect', 'Reconnect Meta'],
      ['reconnect', 'Reconnect Google'],
      ['low_balance', 'Google ad balance is low'],
    ]);
    expect(alerts[2]?.href).toBe('https://ads.google.com/aw/billing/summary');
  });

  it('flags a failed place on a live campaign', () => {
    const campaign: AlertCampaign = {
      ...live([], 0),
      placements: [{ state: 'failed', error: 'Connect Google first' }],
    };
    expect(run([campaign])[0]).toMatchObject({
      kind: 'needs_attention',
      body: 'Connect Google first',
    });
  });
});

describe('launch results', () => {
  it('is live when any place runs, failed when none does, posted for a post', () => {
    expect(campaignStateAfter(['failed', 'in_review'], 'chats')).toBe('live');
    expect(campaignStateAfter(['failed', 'failed'], 'chats')).toBe('failed');
    expect(campaignStateAfter(['sent'], 'chats')).toBe('live');
  });
});

describe('ready places', () => {
  const facts = {
    mode: 'live' as const,
    meta: { appKeys: true, usable: true, instagramId: 'ig1', pageId: 'p1' },
    google: { appKeys: true, usable: false },
    whatsappToken: true,
    activeTemplates: new Set<string>(),
  };

  it('says why a place cannot run', () => {
    const { ready, why } = readyPlaces(facts);
    expect(ready).toEqual({ instagram: true, facebook: true, google: false, whatsapp: false });
    expect(why.google).toBe('Connect Google first');
    expect(why.whatsapp).toBe("Your WhatsApp offer messages are waiting for Meta's approval");
  });

  it('is ready for everything in practice mode once connected', () => {
    const { ready } = readyPlaces({
      ...facts,
      mode: 'sandbox',
      meta: { appKeys: false, usable: true, instagramId: null, pageId: null },
      google: { appKeys: false, usable: true },
      whatsappToken: false,
    });
    expect(ready).toEqual({ instagram: true, facebook: true, google: true, whatsapp: true });
  });
});
