import { describe, expect, it, vi } from 'vitest';
import type { LinkCheck } from './gateway';
import { LinkSyncService } from './link-sync.service';

/** A database stand-in: the advisory lock answer and the open links. */
function fakeDb(got: boolean, links: string[]) {
  const where = async () => links.map((id) => ({ id }));
  return {
    transaction: async (run: (tx: unknown) => Promise<void>) =>
      run({ execute: async () => ({ rows: [{ got }] }) }),
    select: () => ({ from: () => ({ where }) }),
    insert: () => ({ values: async () => undefined }),
  };
}

const payment = (id: string) => ({
  providerLinkId: id,
  gatewayPaymentId: `pay_${id}`,
  amountPaise: 100,
  feePaise: 0,
  paidAt: new Date(),
});

describe('payment link check', () => {
  it('does nothing while another API copy holds the lock', async () => {
    const gateway = { mode: 'live', check: vi.fn() };
    const sync = new LinkSyncService(fakeDb(false, ['a']) as never, gateway as never, {} as never);
    expect(await sync.run()).toEqual({ recorded: 0, closed: 0 });
    expect(gateway.check).not.toHaveBeenCalled();
  });

  it('skips a link that fails and goes on; a paid link is closed as paid', async () => {
    const checks: Record<string, LinkCheck> = {
      ok: { status: 'paid', payments: [payment('ok')] },
    };
    const gateway = {
      mode: 'live',
      check: vi.fn(async (id: string) => {
        if (id === 'bad') throw new Error('Razorpay 500');
        return checks[id] ?? null;
      }),
    };
    const payments = {
      recordLinkPayment: vi.fn(async () => 'recorded'),
      markLink: vi.fn(async () => 'paid'),
    };
    const sync = new LinkSyncService(
      fakeDb(true, ['bad', 'ok']) as never,
      gateway as never,
      payments as never,
    );
    expect(await sync.run()).toEqual({ recorded: 1, closed: 1 });
    expect(payments.markLink).toHaveBeenCalledWith('ok', 'paid');
  });
});
