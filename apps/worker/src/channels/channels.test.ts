import { describe, expect, it } from 'vitest';
import { MissingFieldError, templateParameters } from './message-templates';
import { isRetryableStatus, templateRequestBody } from './whatsapp-cloud';

describe('templateParameters', () => {
  it('orders values as the template expects', () => {
    expect(
      templateParameters('payment_received', {
        project: 'OH-2026-001',
        customer: 'A. Patil',
        milestone: 'Advance',
        amount: '₹50,000',
      }),
    ).toEqual(['A. Patil', '₹50,000', 'Advance', 'OH-2026-001']);
  });

  it('refuses to send with a missing value', () => {
    expect(() => templateParameters('project_started', { customer: 'A', project: 'P' })).toThrow(
      MissingFieldError,
    );
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
