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

  it('reads an expired link as closed, so a fresh Pay now can follow', () => {
    expect(
      readEvent({
        event: 'payment_link.expired',
        payload: { payment_link: { entity: { id: 'plink_9' } } },
      }),
    ).toEqual({ kind: 'closed', providerLinkId: 'plink_9', status: 'expired' });
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

  it('reads a refund and a dispute as news for finance, keyed to the payment', () => {
    expect(
      readEvent({
        event: 'refund.processed',
        payload: {
          refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 500_00 } },
          payment: { entity: { id: 'pay_1' } },
        },
      }),
    ).toEqual({
      kind: 'refund',
      refund: { what: 'refund', gatewayPaymentId: 'pay_1', amountPaise: 500_00, key: 'rfnd_1' },
    });
    // The same refund told twice (both events) is one alert; a second partial refund is another.
    expect(
      readEvent({
        event: 'payment.refunded',
        payload: {
          refund: { entity: { id: 'rfnd_2', payment_id: 'pay_1', amount: 200_00 } },
          payment: { entity: { id: 'pay_1', amount_refunded: 700_00 } },
        },
      }),
    ).toMatchObject({ kind: 'refund', refund: { what: 'refund', key: 'rfnd_2' } });
    expect(
      readEvent({
        event: 'payment.refunded',
        payload: { payment: { entity: { id: 'pay_1', amount_refunded: 500_00 } } },
      }),
    ).toMatchObject({ kind: 'refund', refund: { what: 'refund', key: 'refund' } });
    expect(
      readEvent({
        event: 'payment.dispute.lost',
        payload: { dispute: { entity: { id: 'disp_1', payment_id: 'pay_1', amount: 900_00 } } },
      }),
    ).toEqual({
      kind: 'refund',
      refund: {
        what: 'dispute (lost)',
        gatewayPaymentId: 'pay_1',
        amountPaise: 900_00,
        key: 'disp_1:payment.dispute.lost',
      },
    });
    expect(readEvent({ event: 'refund.processed', payload: {} })).toEqual({ kind: 'ignored' });
  });
});
