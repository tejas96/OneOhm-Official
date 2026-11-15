import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ConversionInput } from '../types';
import { createMetaPlatform } from './meta-platform';
import { fakeGraph, metaAccess, metaApp, status } from './meta-test-kit';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const now = new Date();

const event = (over: Partial<ConversionInput> = {}): ConversionInput => ({
  id: 'e1',
  event: 'won',
  eventAt: now,
  valuePaise: 12345600,
  phoneE164: '+91 98765-43210',
  email: ' Asha@Example.com ',
  gclid: null,
  fbclid: null,
  ctwaClid: null,
  platformLeadId: null,
  leadCreatedAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

describe('meta conversions', () => {
  it('sends a WhatsApp ad click as business messaging', async () => {
    const { fetch, calls } = fakeGraph({ 'POST ds1/events': { events_received: 1 } });
    const out = await createMetaPlatform(
      metaAccess({ whatsappBusinessAccountId: 'waba1' }),
      metaApp(fetch),
    ).sendConversions([event({ ctwaClid: 'CLID', event: 'survey' })]);
    expect(out).toEqual([{ id: 'e1', status: 'sent' }]);
    const [sent] = (calls[0]?.body.data ?? []) as Record<string, unknown>[];
    expect(sent).toMatchObject({
      event_name: 'QualifiedLead',
      event_id: 'e1',
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      event_time: Math.floor(now.getTime() / 1000),
      user_data: {
        ph: [sha('919876543210')],
        em: [sha('asha@example.com')],
        ctwa_clid: 'CLID',
        whatsapp_business_account_id: 'waba1',
      },
      custom_data: {
        currency: 'INR',
        value: 123456,
        event_source: 'crm',
        lead_event_source: 'OneOhm',
      },
    });
  });

  it('uses lead form names and web fbc', async () => {
    const { fetch, calls } = fakeGraph({ 'POST ds1/events': {} });
    await createMetaPlatform(metaAccess(), metaApp(fetch)).sendConversions([
      event({ id: 'l1', platformLeadId: 'L9', event: 'quoted', valuePaise: null, email: null }),
      event({ id: 'w1', fbclid: 'FB1', event: 'advance_paid' }),
    ]);
    const [lead, web] = (calls[0]?.body.data ?? []) as Record<string, Record<string, unknown>>[];
    expect(lead).toMatchObject({
      event_name: 'Quoted',
      action_source: 'system_generated',
      user_data: { lead_id: 'L9' },
    });
    expect(lead?.custom_data).not.toHaveProperty('value');
    expect(lead?.user_data).not.toHaveProperty('em');
    expect(web).toMatchObject({
      event_name: 'AddPaymentInfo',
      user_data: { fbc: `fb.1.${new Date('2026-11-01T00:00:00Z').getTime()}.FB1` },
    });
  });

  it('skips events older than 7 days and a missing dataset', async () => {
    const { fetch, calls } = fakeGraph({ 'POST ds1/events': {} });
    const old = event({ id: 'old', eventAt: new Date(Date.now() - 8 * 86400_000) });
    const out = await createMetaPlatform(metaAccess(), metaApp(fetch)).sendConversions([
      old,
      event(),
    ]);
    expect(out.map((o) => o.status)).toEqual(['skipped', 'sent']);
    expect(calls[0]?.body.data).toHaveLength(1);

    const none = await createMetaPlatform(
      metaAccess({ datasetId: '' }),
      metaApp(fetch),
    ).sendConversions([event()]);
    expect(none).toEqual([{ id: 'e1', status: 'retry', error: 'No Conversions API dataset yet' }]);
  });

  it('batches by 500 and fails only a batch Meta refused as invalid', async () => {
    let n = 0;
    const { fetch, calls } = fakeGraph({
      'POST ds1/events': () =>
        ++n === 1
          ? {}
          : status(400, {
              error: { code: 100, message: 'bad', error_user_msg: 'Dataset is paused' },
            }),
    });
    const events = Array.from({ length: 501 }, (_, i) => event({ id: `e${i}` }));
    const out = await createMetaPlatform(metaAccess(), metaApp(fetch)).sendConversions(events);
    expect(calls.map((c) => (c.body.data as unknown[]).length)).toEqual([500, 1]);
    expect(out[0]?.status).toBe('sent');
    expect(out[500]).toEqual({ id: 'e500', status: 'failed', error: 'Dataset is paused' });
  });

  it.each([
    ['auth', 190],
    ['rate', 17],
    ['temporary', 2],
    ['permission', 200],
  ])('rethrows a %s error instead of failing the events', async (kind, code) => {
    const { fetch } = fakeGraph({
      'POST ds1/events': status(400, { error: { code, message: 'nope' } }),
    });
    await expect(
      createMetaPlatform(metaAccess(), metaApp(fetch)).sendConversions([event()]),
    ).rejects.toMatchObject({ kind });
  });

  it('handles each event alone before sending', async () => {
    const { fetch, calls } = fakeGraph({ 'POST ds1/events': {} });
    const out = await createMetaPlatform(metaAccess(), metaApp(fetch)).sendConversions([
      event({ id: 'nov', valuePaise: null }),
      event({ id: 'nov2', event: 'advance_paid', valuePaise: null }),
      event({ id: 'old', eventAt: new Date(Date.now() - 6.8 * 86400_000) }),
      event({ id: 'ok', eventAt: new Date(Date.now() - 6 * 86400_000) }),
      event({ id: 'ctwa', ctwaClid: 'CLID', event: 'survey' }),
    ]);
    expect(out).toEqual([
      { id: 'nov', status: 'skipped', error: 'No deal value yet' },
      { id: 'nov2', status: 'skipped', error: 'No deal value yet' },
      expect.objectContaining({ id: 'old', status: 'skipped' }),
      { id: 'ok', status: 'sent' },
      { id: 'ctwa', status: 'sent' },
    ]);
    const sent = (calls[0]?.body.data ?? []) as Record<string, Record<string, unknown>>[];
    expect(sent.map((s) => s.event_id)).toEqual(['ok', 'ctwa']);
    // No WhatsApp Business account: the click goes as a web-style event, still with the phone hash.
    expect(sent[1]).toMatchObject({
      event_name: 'Schedule',
      action_source: 'system_generated',
      user_data: { ph: [sha('919876543210')] },
    });
    expect(sent[1]?.user_data).not.toHaveProperty('ctwa_clid');
  });
});
