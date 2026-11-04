import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readWebhook, verifyMetaSignature, webhookAccess } from './whatsapp-events';

const post = (value: unknown) => ({ entry: [{ changes: [{ field: 'messages', value }] }] });

describe('WhatsApp webhook', () => {
  it('checks the sha256 signature', () => {
    const raw = Buffer.from('{}');
    const good = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;
    expect(verifyMetaSignature(raw, good, 's3cret')).toBe(true);
    expect(verifyMetaSignature(raw, good, 'other')).toBe(false);
    expect(verifyMetaSignature(raw, 'abc', 's3cret')).toBe(false);
  });

  it('reads the ad behind a click-to-WhatsApp message, and null without one', () => {
    const { incoming } = readWebhook(
      post({
        messages: [
          {
            from: '919000000101',
            id: 'w1',
            type: 'text',
            text: { body: 'Hi' },
            referral: {
              source_id: 'ad-77',
              source_url: 'https://fb.me/abc',
              headline: 'Solar for homes',
              source_type: 'ad',
            },
          },
          { from: '919000000101', id: 'w2', type: 'text', text: { body: 'Hi' } },
        ],
      }),
    );
    expect(incoming[0]?.referral).toEqual({
      sourceId: 'ad-77',
      sourceUrl: 'https://fb.me/abc',
      headline: 'Solar for homes',
    });
    expect(incoming[1]?.referral).toBeNull();
  });

  it('reads text and list taps with the sender name', () => {
    const { incoming } = readWebhook(
      post({
        contacts: [{ wa_id: '919000000101', profile: { name: 'Ramesh' } }],
        messages: [
          {
            from: '919000000101',
            id: 'w1',
            timestamp: '1790000000',
            type: 'text',
            text: { body: ' Hi ' },
          },
          {
            from: '919000000101',
            id: 'w2',
            type: 'interactive',
            interactive: { list_reply: { id: 'payments', title: 'Payments' } },
          },
        ],
      }),
    );
    expect(incoming[0]).toMatchObject({
      from: '+919000000101',
      kind: 'text',
      text: 'Hi',
      profileName: 'Ramesh',
    });
    expect(incoming[1]).toMatchObject({ kind: 'choice', choiceId: 'payments' });
  });

  it('reads the file in photos, papers, videos and voice notes', () => {
    const { incoming } = readWebhook(
      post({
        messages: [
          {
            from: '919000000101',
            id: 'm1',
            type: 'image',
            image: { id: 'media-1', mime_type: 'image/jpeg', caption: ' Inverter light is red ' },
          },
          {
            from: '919000000101',
            id: 'm2',
            type: 'document',
            document: { id: 'media-2', mime_type: 'application/pdf', filename: 'bill.pdf' },
          },
          { from: '919000000101', id: 'm3', type: 'audio', audio: { id: 'media-3' } },
          { from: '919000000101', id: 'm4', type: 'image', image: { caption: 'no file' } },
        ],
      }),
    );
    expect(incoming[0]).toMatchObject({
      kind: 'media',
      text: 'Inverter light is red',
      media: { type: 'image', id: 'media-1', mimeType: 'image/jpeg', fileName: null },
    });
    expect(incoming[1]).toMatchObject({
      kind: 'media',
      text: 'bill.pdf',
      media: { type: 'document', id: 'media-2', fileName: 'bill.pdf' },
    });
    expect(incoming[2]).toMatchObject({
      kind: 'media',
      text: '',
      media: { type: 'audio', id: 'media-3', mimeType: null },
    });
    expect(incoming[3]).toMatchObject({ kind: 'other' });
  });

  it('reads a location, a contact card and a sticker as words the chat can show', () => {
    const from = '919000000101';
    const { incoming } = readWebhook(
      post({
        messages: [
          {
            from,
            id: 'm1',
            type: 'location',
            location: { latitude: 18.52, longitude: 73.85, name: 'Our roof', address: 'Pune' },
          },
          { from, id: 'm2', type: 'location', location: { latitude: 1.5, longitude: -2 } },
          {
            from,
            id: 'm3',
            type: 'contacts',
            contacts: [
              {
                name: { formatted_name: 'Ravi Patil' },
                phones: [{ phone: '+91 90000 00102' }],
              },
              { name: { formatted_name: 'No Number' } },
            ],
          },
          { from, id: 'm4', type: 'sticker', sticker: { id: 'st-1' } },
        ],
      }),
    );
    expect(incoming[0]).toMatchObject({
      kind: 'other',
      text: '📍 Location: Our roof, Pune https://maps.google.com/?q=18.52,73.85',
    });
    expect(incoming[1]).toMatchObject({
      kind: 'other',
      text: '📍 Location: https://maps.google.com/?q=1.5,-2',
    });
    expect(incoming[2]).toMatchObject({
      kind: 'other',
      text: '👤 Contact: Ravi Patil +91 90000 00102\n👤 Contact: No Number',
    });
    expect(incoming[3]).toMatchObject({ kind: 'other', text: 'Sticker' });
    const { incoming: odd } = readWebhook(
      post({
        messages: [
          { from, id: 'm5', type: 'order' },
          { from, id: 'm6', type: 'contacts' },
        ],
      }),
    );
    expect(odd.map((message) => message.text)).toEqual(['Message (order)', 'Message (contacts)']);
  });

  it('names a reaction and an unsupported message; a reaction is quiet', () => {
    const from = '919000000101';
    const { incoming } = readWebhook(
      post({
        messages: [
          { from, id: 'r1', type: 'reaction', reaction: { message_id: 'w', emoji: '👍' } },
          { from, id: 'r2', type: 'reaction', reaction: { message_id: 'w' } },
          { from, id: 'r3', type: 'unsupported' },
          { from, id: 'r4', type: 'sticker', sticker: { id: 's' } },
        ],
      }),
    );
    expect(incoming.map((message) => message.text)).toEqual([
      'Reaction 👍',
      'Reaction',
      'Unsupported message',
      'Sticker',
    ]);
    expect(incoming.map((message) => message.quiet === true)).toEqual([true, true, false, false]);
  });

  it('reads delivery receipts and failures', () => {
    const { updates } = readWebhook(
      post({
        statuses: [
          { id: 'wamid.1', status: 'read', timestamp: '1790000000' },
          {
            id: 'wamid.2',
            status: 'failed',
            errors: [{ code: 131047, title: 'Re-engagement message' }],
          },
          { id: 'wamid.3', status: 'deleted' },
        ],
      }),
    );
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ status: 'failed', error: '131047 Re-engagement message' });
  });
});

describe('who may post to the webhook', () => {
  const body = Buffer.from('{"entry":[]}');
  const sign = (secret: string) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const key = 'k'.repeat(40);

  it('needs Meta’s signature once the app secret is set, whatever the URL', () => {
    const settings = { appSecret: 's3cret', pathKey: key };
    expect(webhookAccess(settings, { rawBody: body, signature: sign('s3cret') })).toBe('ok');
    expect(webhookAccess(settings, { key, rawBody: body, signature: sign('other') })).toBe(
      'bad_signature',
    );
    expect(webhookAccess(settings, { key, rawBody: body })).toBe('bad_signature');
  });

  it('takes the secret link only while there is no app secret', () => {
    expect(webhookAccess({ pathKey: key }, { key, rawBody: body })).toBe('ok');
    expect(webhookAccess({ pathKey: key }, { key: 'k'.repeat(39), rawBody: body })).toBe(
      'not_found',
    );
    expect(webhookAccess({ pathKey: key }, { rawBody: body })).toBe('not_found');
  });

  it('is closed when neither is set', () => {
    expect(webhookAccess({}, { key, rawBody: body })).toBe('not_found');
  });
});

describe('webhook with the app secret set', () => {
  const unsigned = Buffer.from('{"entry":[]}');
  it('refuses an unsigned or wrongly signed post on every path', () => {
    const settings = { appSecret: 's3cret', pathKey: 'k'.repeat(40) };
    const key = 'k'.repeat(40);
    expect(webhookAccess(settings, { rawBody: unsigned })).toBe('bad_signature');
    expect(webhookAccess(settings, { key, rawBody: unsigned })).toBe('bad_signature');
    expect(webhookAccess(settings, { key, rawBody: unsigned, signature: '' })).toBe(
      'bad_signature',
    );
    expect(webhookAccess(settings, { key, signature: 'sha256=00' })).toBe('bad_signature');
  });
});
