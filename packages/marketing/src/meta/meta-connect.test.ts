import { describe, expect, it } from 'vitest';
import { PlatformError } from '../errors';
import {
  META_SCOPES,
  metaDiscover,
  metaExchangeCode,
  metaLoginUrl,
  metaPrepare,
} from './meta-connect';
import { type Call, fakeGraph, metaApp, status } from './meta-test-kit';

describe('meta connect', () => {
  it('builds the login url with scopes or a config id', () => {
    const app = metaApp(fetch);
    const url = new URL(metaLoginUrl(app, { redirectUri: 'https://x.test/cb', state: 'S' }));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v26.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toBe(META_SCOPES.join(','));
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('S');
    const withConfig = new URL(
      metaLoginUrl({ ...app, loginConfigId: 'CFG' }, { redirectUri: 'r', state: 's' }),
    );
    expect(withConfig.searchParams.get('config_id')).toBe('CFG');
    expect(withConfig.searchParams.has('scope')).toBe(false);
  });

  it('exchanges the code for a long-lived token', async () => {
    const { fetch, calls } = fakeGraph({
      'GET oauth/access_token': (call: Call) =>
        call.query.get('grant_type')
          ? { access_token: 'LONG', expires_in: 5184000 }
          : { access_token: 'SHORT' },
    });
    const out = await metaExchangeCode(metaApp(fetch), 'CODE', 'https://x.test/cb');
    expect(out.userToken).toBe('LONG');
    expect((out.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
    expect(calls[0]?.query.get('code')).toBe('CODE');
    expect(calls[1]?.query.get('fb_exchange_token')).toBe('SHORT');
    const never = fakeGraph({ 'GET oauth/access_token': { access_token: 'N' } });
    expect((await metaExchangeCode(metaApp(never.fetch), 'c', 'r')).expiresAt).toBeNull();
  });

  it('discovers accounts, pages and missing permissions', async () => {
    const { fetch } = fakeGraph({
      'GET me/adaccounts': {
        data: [{ id: 'act_1', name: 'Main', currency: 'INR', account_status: 1 }],
      },
      'GET me/accounts': {
        data: [
          {
            id: 'P1',
            name: 'Page',
            access_token: 'PT',
            instagram_business_account: { id: 'IG1', username: 'sunpower' },
          },
          { id: 'P2', name: 'Other', access_token: 'PT2' },
        ],
      },
      'GET me/permissions': {
        data: [
          { permission: 'ads_management', status: 'granted' },
          { permission: 'ads_read', status: 'declined' },
        ],
      },
    });
    const out = await metaDiscover(metaApp(fetch), 'U');
    expect(out.adAccounts[0]).toMatchObject({ id: 'act_1', note: 'INR', accountStatus: 1 });
    expect(out.pages[0]).toMatchObject({
      id: 'P1',
      note: 'Instagram @sunpower',
      instagramId: 'IG1',
      pageToken: 'PT',
    });
    expect(out.pages[1]?.note).toBeNull();
    expect(out.missing).toContain('ads_read');
    expect(out.missing).not.toContain('ads_management');
  });

  const access = {
    userToken: 'U',
    pageToken: 'PT',
    pageId: 'P1',
    adAccountId: 'act_1',
    whatsappBusinessAccountId: null,
  };

  it('subscribes the page and makes a pixel when none exists', async () => {
    const { fetch, calls } = fakeGraph({
      'POST P1/subscribed_apps': { success: true },
      'GET act_1/adspixels': { data: [] },
      'POST act_1/adspixels': { id: 'PX1' },
    });
    const out = await metaPrepare(metaApp(fetch), access);
    expect(out).toEqual({ datasetId: 'PX1', notes: [] });
    expect(calls[0]?.query.get('access_token')).toBe('PT');
    expect(calls[0]?.body.subscribed_fields).toBe(
      'leadgen,messages,messaging_postbacks,messaging_referrals,feed',
    );
    expect(calls[2]?.body).toEqual({ name: 'OneOhm' });
  });

  it('uses the WhatsApp dataset, and turns failures into notes but not auth', async () => {
    const { fetch } = fakeGraph({
      'POST P1/subscribed_apps': status(400, {
        error: { code: 100, message: 'x', error_user_msg: 'Cannot subscribe' },
      }),
      'GET W1/dataset': { data: [{ id: 'DS1' }] },
    });
    const out = await metaPrepare(metaApp(fetch), { ...access, whatsappBusinessAccountId: 'W1' });
    expect(out.datasetId).toBe('DS1');
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toContain('Cannot subscribe');

    const dead = fakeGraph({
      'POST P1/subscribed_apps': status(400, { error: { code: 190, message: 'x' } }),
    });
    await expect(metaPrepare(metaApp(dead.fetch), access)).rejects.toBeInstanceOf(PlatformError);
  });
});
