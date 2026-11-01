import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readEvent, verifySignature } from './razorpay-events';

describe('Razorpay webhooks', () => {
  const body = Buffer.from('{"event":"payment_link.paid"}');
  const signed = createHmac('sha256', 'secret').update(body).digest('hex');

  it('accepts only the right signature', () => {
    expect(verifySignature(body, signed, 'secret')).toBe(true);
    expect(verifySignature(body, signed, 'other')).toBe(false);
    expect(verifySignature(body, undefined, 'secret')).toBe(false);
  });

  it('reads a paid link with its fee', () => {
    const news = readEvent({
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: 'plink_1' } },
        payment: {
          entity: { id: 'pay_1', amount: 50_000_00, fee: 1_180_00, created_at: 1_790_000_000 },
        },
      },
    });
    expect(news).toMatchObject({
      kind: 'paid',
      payment: {
        providerLinkId: 'plink_1',
        gatewayPaymentId: 'pay_1',
        amountPaise: 5_000_000,
        feePaise: 118_000,
      },
    });
  });

  it('reads a payout and ignores other events', () => {
    expect(
      readEvent({
        event: 'settlement.processed',
        payload: {
          settlement: { entity: { id: 'setl_1', amount: 4_882_000, fees: 118_000, utr: 'UTR1' } },
        },
      }),
    ).toMatchObject({ kind: 'payout', payout: { providerSettlementId: 'setl_1', utr: 'UTR1' } });
    expect(readEvent({ event: 'payment.authorized' })).toEqual({ kind: 'ignored' });
  });
});
