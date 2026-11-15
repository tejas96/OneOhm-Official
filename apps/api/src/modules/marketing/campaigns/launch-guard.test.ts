import { PlatformError } from '@oneohm/marketing';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignContext } from './campaign-context';
import { claimCampaign, claimPlacement } from './launch-claim';
import { currencyWords, noteAuthFailure, platformIdOf } from './launch-guard';

const fakeCtx = (rows: unknown[]) => {
  const where = vi.fn(() => ({ returning: () => Promise.resolve(rows) }));
  const set = vi.fn(() => ({ where }));
  return { ctx: { db: { update: () => ({ set }) } } as unknown as CampaignContext, set };
};

describe('platformIdOf', () => {
  it('prefers the saved id, then the campaign id', () => {
    expect(platformIdOf({ externalId: '123', externalIds: { campaign: '9' } })).toBe('123');
    expect(platformIdOf({ externalId: null, externalIds: { campaign: '9' } })).toBe('9');
  });

  it('cuts a Google resource name down to the id', () => {
    expect(
      platformIdOf({ externalId: null, externalIds: { campaign: 'customers/1/campaigns/77' } }),
    ).toBe('77');
  });

  it('is null when nothing was made', () => {
    expect(platformIdOf({ externalId: null, externalIds: {} })).toBeNull();
  });
});

describe('currencyWords', () => {
  it('lets rupees and unknown pass, refuses anything else', () => {
    expect(currencyWords('meta', 'INR')).toBeNull();
    expect(currencyWords('meta', null)).toBeNull();
    expect(currencyWords('google', 'USD')).toContain('Pick an ad account set to INR.');
  });
});

describe('claims', () => {
  it('skips a place someone else already took', async () => {
    const { ctx } = fakeCtx([]);
    expect(await claimPlacement(ctx, 'p1', ['pending'])).toBeNull();
  });

  it('gives back the place it took, set to pending', async () => {
    const { ctx, set } = fakeCtx([{ id: 'p1', state: 'pending' }]);
    expect(await claimPlacement(ctx, 'p1', ['failed'])).toMatchObject({ id: 'p1' });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'pending', lastError: null }),
    );
  });

  it('says whether the campaign was claimed', async () => {
    expect(await claimCampaign(fakeCtx([]).ctx, 'c1', ['failed'])).toBe(false);
    expect(await claimCampaign(fakeCtx([{ id: 'c1' }]).ctx, 'c1', ['failed'])).toBe(true);
  });
});

describe('noteAuthFailure', () => {
  it('ignores errors that are not a refused sign-in', async () => {
    const insert = vi.fn();
    const ctx = { db: { insert }, config: { secretKey: 'k' } } as unknown as CampaignContext;
    await noteAuthFailure(ctx, 'meta', new PlatformError('rate', 'Slow down.'));
    await noteAuthFailure(ctx, 'meta', new Error('x'));
    expect(insert).not.toHaveBeenCalled();
  });
});
