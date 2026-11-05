import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { flowOf, photo } from '../support/forms';
import { Session } from '../support/http';
import { milestoneOf, recordPayment } from '../support/money';
import { tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { actionsOf, openChat, setForm } from '../support/send';
import { project as projectOf } from '../support/tasks';
import { sendInbound } from '../support/whatsapp';

// Plan check fixes (redesign §10): proof the team never asked for is still a tracked "To check"
// item on that instalment, and recording the payment closes it.

const FLOW = '770011223355';

describe('Payments: proof nobody asked for', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await setForm('paid_another_way', FLOW);
  });
  afterAll(async () => {
    await setForm('paid_another_way', null);
    await closeDb();
  });

  it('becomes a pay item waiting for finance, closed when the payment is recorded', async () => {
    const sale = await sellProject(admin, { name: 'Proof Unasked (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    expect(await actionsOf(sale.customer.customerId, 'pay')).toHaveLength(0);
    await tap(sale.customer.phone, `paidother:${advance.id}`);
    const flow = await flowOf(sale.customer.phone);
    await sendInbound(sale.customer.phone, {
      form: {
        token: flow?.token ?? '',
        photos: [photo('proof')],
        amount: '5000',
        date: '2026-11-04',
      },
    });
    const [action] = await actionsOf(sale.customer.customerId, 'pay');
    expect(action).toMatchObject({ status: 'received' });
    expect(action?.payload).toMatchObject({ milestoneId: advance.id });
    await recordPayment(
      admin,
      sale.project.id,
      milestoneOf(await projectOf(admin, sale.project.id), 'quotation_accepted'),
      'upi',
    );
    expect((await actionsOf(sale.customer.customerId, 'pay'))[0]?.status).toBe('closed');
  });
});
