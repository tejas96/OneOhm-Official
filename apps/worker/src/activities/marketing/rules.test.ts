import type { MetaTools } from '@oneohm/marketing';
import { PlatformError } from '@oneohm/marketing';
import { describe, expect, it, vi } from 'vitest';
import { placementVerdict } from './ad-status';
import { capChanges, diffAudience } from './audience-diff';
import { isLowBalance } from './balance';
import { adsWithoutLeads, lastFullDays } from './no-leads';
import { reviewWords, shouldAnnounce } from './review-rules';
import { SOCIAL_MAYBE_SENT, sendSocialMessage } from './social-delivery';
import { foldStatuses } from './template-approval';

describe('audience diff', () => {
  it('adds the new and removes the gone', () => {
    const diff = diffAudience(new Set(['a', 'b']), new Set(['b', 'c']));
    expect(diff).toEqual({ add: ['a'], remove: ['c'] });
  });

  it('is empty when nothing changed (running twice changes nothing)', () => {
    expect(diffAudience(new Set(['a']), new Set(['a']))).toEqual({ add: [], remove: [] });
  });

  it('caps the changes, adds first', () => {
    expect(capChanges({ add: ['1', '2', '3'], remove: ['x', 'y'] }, 4)).toEqual({
      add: ['1', '2', '3'],
      remove: ['x'],
    });
    expect(capChanges({ add: ['1', '2'], remove: ['x'] }, 0)).toEqual({ add: [], remove: [] });
  });
});

describe('review words', () => {
  it('words a review and announces only the last three days', () => {
    expect(reviewWords(5, 'Asha')).toBe('New Google review: ★★★★★ from Asha');
    const now = new Date('2026-11-15T00:00:00Z');
    expect(shouldAnnounce({ publishedAt: new Date('2026-06-01T00:00:00Z') }, now)).toBe(false);
    expect(shouldAnnounce({ publishedAt: null }, now)).toBe(false);
    expect(shouldAnnounce({ publishedAt: new Date('2026-11-14T00:00:00Z') }, now)).toBe(true);
  });
});

describe('no leads rule', () => {
  const days = lastFullDays('2026-11-15', 2);
  const line = (externalId: string, day: string, spendPaise: number, campaignId = 'c1') => ({
    externalId,
    campaignId,
    day,
    spendPaise,
  });

  it('lists the last full days', () => {
    expect(days).toEqual(['2026-11-13', '2026-11-14']);
  });

  it('flags an ad that spent every day with no leads', () => {
    const lines = [line('a', days[0] as string, 30_000), line('a', days[1] as string, 20_000)];
    expect(adsWithoutLeads(lines, days, new Set())).toEqual([
      { externalId: 'a', campaignId: 'c1', spendPaise: 50_000 },
    ]);
  });

  it('leaves out an ad with a lead, a gap day or no spend', () => {
    const both = [line('a', days[0] as string, 100), line('a', days[1] as string, 100)];
    expect(adsWithoutLeads(both, days, new Set(['c1']))).toEqual([]);
    expect(adsWithoutLeads([line('a', days[0] as string, 100)], days, new Set())).toEqual([]);
    expect(
      adsWithoutLeads(
        [line('a', days[0] as string, 0), line('a', days[1] as string, 5)],
        days,
        new Set(),
      ),
    ).toEqual([]);
  });
});

describe('ad review and balance', () => {
  const ok = { externalId: 'a', status: 'ACTIVE', inReview: false, rejected: false, reason: null };
  it('goes live when no ad is in review', () => {
    expect(placementVerdict('in_review', [ok])).toEqual({ state: 'live', reason: null });
    expect(placementVerdict('in_review', [{ ...ok, inReview: true }]).state).toBe('in_review');
  });
  it('fails with the reason when an ad is rejected', () => {
    expect(
      placementVerdict('in_review', [{ ...ok, rejected: true, reason: 'Too much text' }]),
    ).toEqual({ state: 'failed', reason: 'Too much text' });
  });
  it('knows a low balance', () => {
    expect(isLowBalance(50_000, 100_000)).toBe(true);
    expect(isLowBalance(0, 100_000)).toBe(true);
    expect(isLowBalance(null, 100_000)).toBe(false);
    expect(isLowBalance(200_000, 100_000)).toBe(false);
  });
});

describe('template statuses', () => {
  it('lets an approved version win and keeps the photo flag', () => {
    const folded = foldStatuses([
      { name: 'offer_revisit', status: 'pending', hasImage: true, reason: null },
      { name: 'offer_revisit', status: 'approved', hasImage: false, reason: null },
      { name: 'offer_revisit', status: 'approved', hasImage: true, reason: null },
    ]);
    expect(folded.get('offer_revisit')).toMatchObject({ status: 'approved', hasImage: true });
  });
});

describe('social delivery routing', () => {
  const row = { channel: 'instagram', recipient: 'ig:1784', payload: { body: 'Hi' } };
  const tools = (sendMessage: MetaTools['sendMessage']) =>
    ({ sendMessage }) as unknown as MetaTools;

  it('fails in plain words without Meta', async () => {
    expect(await sendSocialMessage(null, row)).toEqual({
      status: 'failed',
      reason: 'Meta is not connected.',
    });
  });

  it('sends through Meta and gives the message id', async () => {
    const send = vi.fn(async () => ({ messageId: 'm1' }));
    expect(await sendSocialMessage(tools(send), row)).toEqual({ status: 'sent', messageId: 'm1' });
    // The stored handle `ig:<id>` goes to Meta as the bare id.
    expect(send).toHaveBeenCalledWith({
      channel: 'instagram',
      recipientId: '1784',
      commentId: null,
      text: 'Hi',
    });
  });

  it('replies privately to a comment', async () => {
    const send = vi.fn(async () => ({ messageId: 'm2' }));
    await sendSocialMessage(tools(send), {
      ...row,
      channel: 'messenger',
      payload: { body: 'Hi', commentId: 'c9' },
    });
    expect(send).toHaveBeenCalledWith({
      channel: 'messenger',
      recipientId: null,
      commentId: 'c9',
      text: 'Hi',
    });
  });

  it('fails on a permanent refusal and throws a temporary one', async () => {
    const bad = tools(async () => {
      throw new PlatformError('invalid', 'Meta refused the message.');
    });
    expect(await sendSocialMessage(bad, row)).toEqual({
      status: 'failed',
      reason: 'Meta refused the message.',
    });
    const slow = tools(async () => {
      throw new PlatformError('temporary', 'Try later.');
    });
    await expect(sendSocialMessage(slow, row)).rejects.toThrow('Try later.');
  });

  it('fails a timeout as maybe sent, but retries a clear 5xx refusal', async () => {
    const timeout = tools(async () => {
      throw new PlatformError('temporary', 'Slow.', 'network or timeout');
    });
    expect(await sendSocialMessage(timeout, row)).toEqual({
      status: 'failed',
      reason: SOCIAL_MAYBE_SENT,
    });
    const refused = tools(async () => {
      throw new PlatformError('temporary', 'Busy.', 'code 2: down');
    });
    await expect(sendSocialMessage(refused, row)).rejects.toThrow('Busy.');
    const rate = tools(async () => {
      throw new PlatformError('rate', 'Too many.');
    });
    await expect(sendSocialMessage(rate, row)).rejects.toThrow('Too many.');
  });

  it('never sends a WhatsApp row', async () => {
    const send = vi.fn();
    const result = await sendSocialMessage(tools(send), { ...row, channel: 'whatsapp' });
    expect(result.status).toBe('failed');
    expect(send).not.toHaveBeenCalled();
  });
});
