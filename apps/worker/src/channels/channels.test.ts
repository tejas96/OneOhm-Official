import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { MESSAGE_TEMPLATES, MissingFieldError, templateParameters } from './message-templates';
import {
  createWhatsAppSender,
  isRetryableStatus,
  sessionRequestBody,
  templateRequestBody,
} from './whatsapp-cloud';

describe('templateParameters', () => {
  it('orders values as the template expects', () => {
    expect(
      templateParameters('payment_received', MESSAGE_TEMPLATES.payment_received ?? [], {
        project: 'OH-2026-001',
        customer: 'A. Patil',
        milestone: 'Advance',
        amount: '₹50,000',
      }),
    ).toEqual(['A. Patil', '₹50,000', 'Advance', 'OH-2026-001']);
  });

  it('refuses to send with a missing value', () => {
    expect(() =>
      templateParameters('project_started', MESSAGE_TEMPLATES.project_started ?? [], {
        customer: 'A',
        project: 'P',
      }),
    ).toThrow(MissingFieldError);
  });
});

describe('WhatsApp Cloud request', () => {
  it('drops the plus from the number and sends body parameters', () => {
    const body = templateRequestBody({
      toE164: '+919800000000',
      template: 'project_started',
      language: 'en',
      parameters: ['A', 'B'],
    });
    expect(body.to).toBe('919800000000');
    expect(body.template.components[0]?.parameters).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B' },
    ]);
  });

  it('templateRequestBody adds a document header first', () => {
    const body = templateRequestBody({
      toE164: '+919800000000',
      template: 'quote_ready',
      language: 'en',
      parameters: ['A'],
      header: { kind: 'document', link: 'https://x/q.pdf', filename: 'QT-1.pdf' },
    });
    expect(body.template.components[0]).toEqual({
      type: 'header',
      parameters: [
        { type: 'document', document: { link: 'https://x/q.pdf', filename: 'QT-1.pdf' } },
      ],
    });
    expect(body.template.components[1]?.type).toBe('body');
  });

  it('templateRequestBody adds quick reply and url buttons', () => {
    const body = templateRequestBody({
      toE164: '+919800000000',
      template: 'quote_ready',
      language: 'en',
      parameters: ['A'],
      buttons: [
        { kind: 'quick_reply', index: 0, payload: 'quote_accept:Q' },
        { kind: 'url', index: 1, suffix: 'tok' },
      ],
    });
    expect(body.template.components).toContainEqual({
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [{ type: 'payload', payload: 'quote_accept:Q' }],
    });
    expect(body.template.components).toContainEqual({
      type: 'button',
      sub_type: 'url',
      index: '1',
      parameters: [{ type: 'text', text: 'tok' }],
    });
  });

  it('templateRequestBody without extras is unchanged', () => {
    expect(
      templateRequestBody({
        toE164: '+919800000000',
        template: 'project_started',
        language: 'en',
        parameters: ['A'],
      }),
    ).toEqual({
      messaging_product: 'whatsapp',
      to: '919800000000',
      type: 'template',
      template: {
        name: 'project_started',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'A' }] }],
      },
    });
  });

  it('sessionRequestBody document', () => {
    expect(
      sessionRequestBody('+919800000000', {
        kind: 'document',
        link: 'https://x/q.pdf',
        filename: 'QT-1.pdf',
        caption: 'Your quote',
      }),
    ).toMatchObject({
      type: 'document',
      document: { link: 'https://x/q.pdf', filename: 'QT-1.pdf', caption: 'Your quote' },
    });
  });

  it('sessionRequestBody cta_url cuts the label to 20 characters', () => {
    expect(
      sessionRequestBody('+919800000000', {
        kind: 'cta_url',
        body: 'Pay',
        label: 'A very long button label indeed',
        url: 'https://x/pay',
      }),
    ).toMatchObject({
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: 'Pay' },
        action: {
          name: 'cta_url',
          parameters: { display_text: 'A very long button l', url: 'https://x/pay' },
        },
      },
    });
  });

  it('retries only rate limits and server errors', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
  });
});

describe('test numbers while testing live', () => {
  const config = loadConfig({
    WHATSAPP_DELIVERY: 'live',
    WHATSAPP_ACCESS_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '1',
    WHATSAPP_TEST_NUMBERS: '+91 98000 00001, +919800000000',
    DATABASE_URL: 'postgres://x',
  });

  it('holds messages to numbers outside the list without calling Meta', async () => {
    const calls: unknown[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (...args: unknown[]) => {
      calls.push(args);
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    try {
      const sender = createWhatsAppSender(config, () => {});
      const result = await sender.sendSession('+919111111111', { kind: 'text', body: 'hi' });
      expect(result).toEqual({
        outcome: 'logged',
        note: 'Not sent: only test numbers get messages right now.',
      });
      expect(calls).toHaveLength(0);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('reads the list with spaces removed', () => {
    expect(config.WHATSAPP_TEST_NUMBERS).toEqual(['+919800000001', '+919800000000']);
  });

  it('is refused in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        WHATSAPP_TEST_NUMBERS: '+919800000000',
        DATABASE_URL: 'postgres://x',
      }),
    ).toThrow(/testing only/);
  });
});
