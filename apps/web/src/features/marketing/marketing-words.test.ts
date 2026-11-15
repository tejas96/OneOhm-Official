import type { CampaignCard, CampaignNumbers } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { changeCard, optimisticCard } from './campaign-change';
import { type Draft, launchProblem, startsAtOf, tidyChannels, toInput } from './compose-checks';
import { launchOutcome, sendStepOf, stepShown } from './launch-steps';
import {
  availableActions,
  budgetBreakdown,
  cardNumbers,
  paiseFromRupeeText,
  samplePreview,
  starsOf,
  tokenNeedsWarning,
} from './marketing-words';

const numbers = (over: Partial<CampaignNumbers> = {}): CampaignNumbers => ({
  spentPaise: 0,
  leads: 0,
  sales: 0,
  salesValuePaise: 0,
  costPerLeadPaise: null,
  costPerSalePaise: null,
  messagesSent: 0,
  messagesRead: 0,
  ...over,
});

const card = (over: Partial<CampaignCard> = {}): CampaignCard => ({
  id: 'c1',
  code: 'SOLAR-01',
  name: 'Solar',
  goal: 'chats',
  state: 'live',
  look: 'live',
  channels: ['instagram'],
  city: 'Pune',
  dailyBudgetPaise: 50_000,
  mediaUrl: null,
  mediaKind: null,
  text: 'x',
  startsAt: null,
  launchedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  numbers: numbers(),
  placements: [],
  actions: { pause: true, stop: true, runAgain: false },
  ...over,
});

const draft = (over: Partial<Draft> = {}): Draft => ({
  goal: 'chats',
  mediaId: 'm1',
  mediaKind: 'image',
  uploading: false,
  text: 'Solar for your roof',
  channels: ['instagram', 'facebook'],
  segments: [],
  city: 'Pune',
  budget: '500',
  when: 'now',
  date: '',
  time: '',
  ...over,
});

describe('card numbers', () => {
  it('shows dashes while nothing has happened', () => {
    expect(cardNumbers(numbers()).map((n) => n.value)).toEqual([null, null, null, null]);
  });
  it('keeps real values', () => {
    const shown = cardNumbers(numbers({ spentPaise: 100, leads: 3, costPerSalePaise: 50 }));
    expect(shown.map((n) => n.value)).toEqual([100, 3, null, 50]);
  });
});

describe('budget', () => {
  it('splits between paid platforms and gives a month', () => {
    const line = budgetBreakdown(50_000, 'chats', ['instagram', 'google']);
    expect(line?.monthlyPaise).toBe(1_500_000);
    expect(line?.parts).toEqual([
      { provider: 'meta', paise: 25_000 },
      { provider: 'google', paise: 25_000 },
    ]);
  });
  it('has nothing for a post or WhatsApp only', () => {
    expect(budgetBreakdown(50_000, 'post', ['instagram'])).toBeNull();
    expect(budgetBreakdown(50_000, 'chats', ['whatsapp'])).toBeNull();
  });
  it('reads rupee text', () => {
    expect(paiseFromRupeeText('₹1,000')).toBe(100_000);
    expect(paiseFromRupeeText('abc')).toBe(0);
  });
});

describe('launch checks', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  it('is ready with everything filled', () => {
    expect(launchProblem(draft(), now)).toBeNull();
  });
  it('names the first missing thing', () => {
    expect(launchProblem(draft({ uploading: true }), now)?.kind).toBe('uploading');
    expect(launchProblem(draft({ mediaId: null }), now)?.kind).toBe('noMedia');
    expect(launchProblem(draft({ text: ' ' }), now)?.kind).toBe('noText');
    expect(launchProblem(draft({ channels: [] }), now)?.kind).toBe('noPlace');
    expect(launchProblem(draft({ city: '' }), now)?.kind).toBe('noCity');
    expect(launchProblem(draft({ budget: '50' }), now)?.kind).toBe('budget');
  });
  it('needs a segment for WhatsApp messages and no Google for video', () => {
    expect(launchProblem(draft({ channels: ['whatsapp'] }), now)?.kind).toBe('noSegment');
    const video = draft({ mediaKind: 'video', channels: ['google'] });
    expect(launchProblem(video, now)?.kind).toBe('googleVideo');
    const videoMessage = draft({
      mediaKind: 'video',
      channels: ['instagram', 'whatsapp'],
      segments: ['past_customers'],
    });
    expect(launchProblem(videoMessage, now)?.kind).toBe('whatsappVideo');
    expect(tidyChannels('chats', ['instagram', 'whatsapp', 'google'], 'video')).toEqual([
      'instagram',
    ]);
  });
  it('needs a future day for a later post', () => {
    const post = draft({ goal: 'post', when: 'later', budget: '' });
    expect(launchProblem(post, now)?.kind).toBe('noDay');
    expect(launchProblem({ ...post, date: '2026-11-01', time: '10:00' }, now)?.kind).toBe(
      'pastDay',
    );
    expect(launchProblem({ ...post, date: '2026-12-01', time: '10:00' }, now)).toBeNull();
  });
  it('builds the request', () => {
    expect(toInput(draft()).dailyBudgetPaise).toBe(50_000);
    expect(toInput(draft({ goal: 'post' })).dailyBudgetPaise).toBe(0);
    const messages = draft({ channels: ['whatsapp'], segments: ['past_customers'] });
    expect(toInput(messages).segments).toEqual(['past_customers']);
  });
  it('drops Google for a post or a video', () => {
    expect(tidyChannels('post', ['google', 'instagram'], 'image')).toEqual(['instagram']);
    expect(tidyChannels('chats', ['google', 'instagram'], 'video')).toEqual(['instagram']);
  });
  it('reads a day and time', () => {
    expect(startsAtOf('', '10:00')).toBeNull();
    expect(startsAtOf('2026-12-01', '10:00')).not.toBeNull();
  });
});

describe('launch walk-through', () => {
  it('picks the third step by what is sent', () => {
    expect(sendStepOf('post', ['instagram'])).toBe('post');
    expect(sendStepOf('chats', ['instagram'])).toBe('review');
    expect(sendStepOf('chats', ['whatsapp'])).toBe('messages');
  });
  it('reads the outcome from the places', () => {
    const place = (state: 'live' | 'failed') => ({
      provider: 'meta' as const,
      state,
      dailyBudgetPaise: 0,
      notes: [],
      error: null,
    });
    expect(launchOutcome({ placements: [place('live')] })).toBe('all_good');
    expect(launchOutcome({ placements: [place('live'), place('failed')] })).toBe('some_failed');
    expect(launchOutcome({ placements: [place('failed')] })).toBe('all_failed');
  });
  it('moves on over time but waits on the last step', () => {
    expect(stepShown(0, 4)).toBe(1);
    expect(stepShown(10_000, 4)).toBe(3);
  });
});

describe('card actions', () => {
  it('pause makes the card paused with run-again offered', () => {
    const next = optimisticCard(card(), 'pause');
    expect(next.look).toBe('paused');
    expect(next.actions).toEqual({ pause: false, stop: true, runAgain: true });
  });
  it('run again shows starting with no buttons', () => {
    expect(optimisticCard(card(), 'runAgain').actions).toEqual({
      pause: false,
      stop: false,
      runAgain: false,
    });
  });
  it('changes only the one card', () => {
    const cards = [card(), card({ id: 'c2' })];
    const next = changeCard(cards, 'c2', (c) => ({ ...c, name: 'B' }));
    expect(next[0]).toBe(cards[0]);
    expect(next[1]?.name).toBe('B');
  });
  it('lists actions in order', () => {
    const all = card({ actions: { pause: true, stop: true, runAgain: true } });
    expect(availableActions(all)).toEqual(['pause', 'runAgain', 'stop']);
  });
});

describe('small helpers', () => {
  it('draws stars', () => {
    expect(starsOf(4.4).filter(Boolean)).toHaveLength(4);
  });
  it('warns before a token runs out', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    expect(tokenNeedsWarning('2026-11-20T00:00:00Z', now)).toBe(true);
    expect(tokenNeedsWarning('2027-02-01T00:00:00Z', now)).toBe(false);
    expect(tokenNeedsWarning(null, now)).toBe(false);
  });
});

describe('message previews', () => {
  it('reads like a real message', () => {
    expect(
      samplePreview(
        'Hello {{1}}, {{2}} here. {{3}}',
        ['customer', 'company', 'message'],
        'Sun Power',
      ),
    ).toBe('Hello Asha, Sun Power here. Get the government subsidy on rooftop solar this month.');
    expect(samplePreview('Hi {{1}} from {{2}}', ['customer', 'company'], '')).toBe(
      'Hi Asha from your business',
    );
  });
});
