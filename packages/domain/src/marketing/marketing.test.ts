import { describe, expect, it } from 'vitest';
import { findCampaignCode } from '../epc/campaign-code';
import { budgetProblem, costPer, returnOnSpend, splitBudget } from './budget';
import { campaignActions, campaignLook, channelsFor, paidProviders } from './campaign-rules';
import { campaignCodeFrom, cutOnWord, findIndianMobile, headlineOf } from './campaign-text';
import { reachedEvents } from './conversions';
import { checkMarketingSettings, DEFAULT_MARKETING_SETTINGS } from './marketing-settings';

describe('campaign codes', () => {
  it('makes a short unique code that the WhatsApp opener reads back', () => {
    const code = campaignCodeFrom('Solar for your home!\nSave ₹78,000 subsidy', new Set());
    expect(code).toBe('SOLAR-01');
    expect(findCampaignCode(`Hi OneOhm ${code}`)).toBe(code);
    expect(campaignCodeFrom('Solar now', new Set(['SOLAR-01']))).toBe('SOLAR-02');
  });

  it('skips filler words and falls back when the text has none', () => {
    expect(campaignCodeFrom('Get the best rooftop deal', new Set())).toBe('BEST-01');
    expect(campaignCodeFrom('🌞', new Set())).toBe('AD-01');
  });
});

describe('campaign text', () => {
  it('cuts headlines on a word', () => {
    expect(headlineOf('Rooftop solar with ₹78,000 subsidy for every home in Pune', 30)).toBe(
      'Rooftop solar with ₹78,000',
    );
    expect(cutOnWord('Short', 30)).toBe('Short');
  });

  it('finds an Indian mobile in a message, not pincodes or amounts', () => {
    expect(findIndianMobile('my number is 98765 43210 call pls')).toBe('+919876543210');
    expect(findIndianMobile('+91-98765-43210')).toBe('+919876543210');
    expect(findIndianMobile('09876543210')).toBe('+919876543210');
    expect(findIndianMobile('pincode 411001, bill 4500')).toBeNull();
    expect(findIndianMobile('12345678901')).toBeNull();
  });
});

describe('campaign looks and actions', () => {
  it('shows one plain status', () => {
    expect(campaignLook('live', ['in_review'])).toBe('in_review');
    expect(campaignLook('live', ['in_review', 'live'])).toBe('live');
    expect(campaignLook('live', ['live', 'failed'])).toBe('needs_attention');
    expect(campaignLook('stopped', ['failed'])).toBe('stopped');
    expect(campaignLook('launching', [])).toBe('starting');
  });

  it('offers only taps that work', () => {
    expect(campaignActions('live')).toEqual({ pause: true, stop: true, runAgain: false });
    expect(campaignActions('paused')).toEqual({ pause: false, stop: true, runAgain: true });
    expect(campaignActions('stopped')).toEqual({ pause: false, stop: false, runAgain: true });
  });

  it('keeps Google out of posts and budgets out of WhatsApp', () => {
    expect(channelsFor('post')).not.toContain('google');
    expect(paidProviders('chats', ['instagram', 'facebook', 'whatsapp'])).toEqual(['meta']);
    expect(paidProviders('lead_form', ['google', 'instagram'])).toEqual(['meta', 'google']);
    expect(paidProviders('post', ['instagram'])).toEqual([]);
  });
});

describe('budget', () => {
  it('splits in whole rupees, odd rupee to the first', () => {
    expect(splitBudget(50_100, ['meta', 'google'])).toEqual({ meta: 25_100, google: 25_000 });
    expect(splitBudget(50_000, ['meta'])).toEqual({ meta: 50_000 });
  });

  it('asks for at least ₹100 a place', () => {
    expect(budgetProblem(15_000, ['meta', 'google'])).toMatch(/₹200/);
    expect(budgetProblem(20_000, ['meta', 'google'])).toBeNull();
    expect(budgetProblem(0, [])).toBeNull();
  });

  it('divides only when there is something to divide by', () => {
    expect(costPer(10_000, 0)).toBeNull();
    expect(costPer(10_000, 3)).toBe(3333);
    expect(returnOnSpend(500_000, 100_000)).toBe(5);
    expect(returnOnSpend(1, 0)).toBeNull();
  });
});

describe('conversion events', () => {
  const none = { surveyBooked: false, quoteSent: false, advancePaid: false, won: false };

  it('counts earlier steps once a later one is reached', () => {
    expect(reachedEvents('new', none)).toEqual([]);
    expect(reachedEvents('survey_scheduled', none)).toEqual(['survey']);
    expect(reachedEvents('quoted', none)).toEqual(['survey', 'quoted']);
    expect(reachedEvents('won', none)).toEqual(['survey', 'quoted', 'won']);
    expect(reachedEvents('won', { ...none, advancePaid: true })).toEqual([
      'survey',
      'quoted',
      'advance_paid',
      'won',
    ]);
    expect(reachedEvents('lost', { ...none, quoteSent: true })).toEqual(['survey', 'quoted']);
  });
});

describe('marketing settings', () => {
  it('accepts the defaults and refuses odd values', () => {
    expect(checkMarketingSettings(DEFAULT_MARKETING_SETTINGS)).toEqual({});
    const errors = checkMarketingSettings({
      ...DEFAULT_MARKETING_SETTINGS,
      defaultDailyBudgetPaise: 500,
      websiteUrl: 'example.com',
    });
    expect(Object.keys(errors).sort()).toEqual(['defaultDailyBudgetPaise', 'websiteUrl']);
  });
});
