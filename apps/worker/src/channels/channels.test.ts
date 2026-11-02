import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { MESSAGE_TEMPLATES, MissingFieldError, templateParameters } from './message-templates';
import { createWhatsAppSender, isRetryableStatus, templateRequestBody } from './whatsapp-cloud';

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
