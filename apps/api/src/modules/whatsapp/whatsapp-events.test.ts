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
