import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readWebhook, verifyMetaSignature } from './whatsapp-events';

const post = (value: unknown) => ({ entry: [{ changes: [{ field: 'messages', value }] }] });

describe('WhatsApp webhook', () => {
  it('checks the sha256 signature', () => {
    const raw = Buffer.from('{}');
    const good = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;
    expect(verifyMetaSignature(raw, good, 's3cret')).toBe(true);
    expect(verifyMetaSignature(raw, good, 'other')).toBe(false);
    expect(verifyMetaSignature(raw, 'abc', 's3cret')).toBe(false);
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
