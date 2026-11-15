import type { ConnectionRow } from '@oneohm/marketing';
import { describe, expect, it } from 'vitest';
import {
  connectionsUrl,
  connectionView,
  missingSettingsWords,
  permissionWords,
  templateView,
} from './connection-words';

const row = (change: Partial<ConnectionRow>): ConnectionRow => ({
  provider: 'meta',
  status: 'connected',
  secrets: 'sealed',
  accountId: 'act_123',
  accountName: 'Sun Power Ads',
  currency: 'INR',
  details: { pageName: 'Sun Power', instagramUsername: 'sunpower' },
  missing: [],
  tokenExpiresAt: null,
  lastError: null,
  balancePaise: 250_000,
  balanceCheckedAt: null,
  connectedByUserId: null,
  connectedAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date(),
  ...change,
});

describe('permission words', () => {
  it('says what a permission does in plain words', () => {
    expect(permissionWords('pages_messaging')).toBe('Reply to Instagram and Facebook messages');
    expect(permissionWords('some_new_thing')).toBe('Some new thing');
  });
});

describe('connection summary', () => {
  it('reads not connected without a row or after disconnecting', () => {
    expect(connectionView('meta', null, ['META_APP_ID']).status).toBe('not_connected');
    const off = connectionView('meta', row({ status: 'disconnected' }), []);
    expect(off.status).toBe('not_connected');
    expect(off.accountName).toBeNull();
    expect(off.topUpUrl).toBeNull();
  });

  it('keeps the missing settings and waiting words', () => {
    const view = connectionView(
      'meta',
      row({ status: 'in_review', missing: ['pages_messaging'] }),
      [],
    );
    expect(view.status).toBe('in_review');
    expect(view.waitingFor).toEqual(['Reply to Instagram and Facebook messages']);
    expect(view.accountName).toBe('Sun Power Ads · INR');
    expect(view.extra).toBe('Sun Power · @sunpower');
    expect(view.topUpUrl).toContain('asset_id=123');
    expect(connectionView('google', null, ['GOOGLE_ADS_CLIENT_ID']).missingSettings).toEqual([
      'GOOGLE_ADS_CLIENT_ID',
    ]);
  });

  it('offers the choices until an account is picked', () => {
    const choices = {
      adAccountChoices: [{ id: 'act_1', name: 'One', note: 'INR' }],
      pageChoices: [{ id: 'p1', name: 'Page', note: null }],
    };
    const view = connectionView(
      'meta',
      row({ status: 'needs_attention', accountId: null, details: choices }),
      [],
    );
    expect(view.choose?.accounts).toHaveLength(1);
    expect(view.choose?.pages).toHaveLength(1);
    const picked = connectionView('meta', row({ status: 'needs_attention', details: choices }), []);
    expect(picked.choose).toBeNull();
  });

  it('shows Google waiting words as saved and the billing page', () => {
    const view = connectionView(
      'google',
      row({
        provider: 'google',
        status: 'in_review',
        accountId: '1234567890',
        details: {},
        missing: ['Google Ads developer token approval'],
      }),
      [],
    );
    expect(view.waitingFor).toEqual(['Google Ads developer token approval']);
    expect(view.topUpUrl).toContain('ads.google.com');
  });
});

describe('template approval words', () => {
  const base = { key: 'offer_revisit', metaName: 'offer_revisit', preview: 'Hi', active: false };
  it('uses what Meta says, not_sent when Meta does not know it, unknown on failure', () => {
    const known = { status: 'rejected' as const, reason: 'Too salesy' };
    const rejected = templateView(base, { asked: true, failed: false, known }, false);
    expect(rejected.approval).toBe('rejected');
    expect(rejected.rejectedReason).toBe('Too salesy');
    expect(templateView(base, { asked: true, failed: false, known: null }, false).approval).toBe(
      'not_sent',
    );
    expect(templateView(base, { asked: true, failed: true, known: null }, false).approval).toBe(
      'unknown',
    );
    expect(templateView(base, { asked: false, failed: false, known: null }, false).approval).toBe(
      'unknown',
    );
  });
  it('treats practice mode by the local switch', () => {
    const none = { asked: false, failed: false, known: null };
    expect(templateView({ ...base, active: true }, none, true).approval).toBe('approved');
    expect(templateView(base, none, true).approval).toBe('not_sent');
  });
});

describe('plain sentences', () => {
  it('names missing settings and builds the return address', () => {
    expect(missingSettingsWords(['META_APP_ID', 'META_APP_SECRET'])).toBe(
      'Add META_APP_ID and META_APP_SECRET to the server settings first.',
    );
    expect(missingSettingsWords(['A', 'B', 'C'])).toBe(
      'Add A, B and C to the server settings first.',
    );
    expect(connectionsUrl('http://localhost:3200/', { connected: 'meta' })).toBe(
      'http://localhost:3200/marketing?tab=connections&connected=meta',
    );
    expect(connectionsUrl('http://x', { error: 'It failed. Try again.' })).toContain(
      'error=It%20failed.%20Try%20again.',
    );
  });
});
