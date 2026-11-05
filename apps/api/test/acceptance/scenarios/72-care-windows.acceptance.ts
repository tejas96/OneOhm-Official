import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { NOON } from '../support/journey-steps';
import { sellProject } from '../support/sales';
import { openChat, templatesFor } from '../support/send';
import { runCare } from '../support/visit-worker';

// Care reminders look at each kind inside its own window, so old asks cannot crowd out fresh ones, and a
// rating nobody answered in 30 days is let go quietly.

const DAY = 86_400_000;

describe('Care reminders: windows and expiry', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const rate = (customerId: string, daysOld: number, count = 1) =>
    rows<{ id: string }>(
      `INSERT INTO customer_actions (type, customer_id, title, payload, created_at, updated_at)
       SELECT 'rating', $1, 'Rate: site survey', '{"kind":"stage","stage":"survey"}'::jsonb, $2::timestamptz, $2::timestamptz
         FROM generate_series(1, $3) RETURNING id`,
      [customerId, new Date(NOON.getTime() - daysOld * DAY), count],
    );

  it('old ratings do not crowd out a fresh one', async () => {
    const sale = await sellProject(admin, { name: 'Care Window (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await rate(sale.customer.customerId, 20, 205);
    const [fresh] = await rate(sale.customer.customerId, 3);
    await runCare(NOON);
    const sent = await templatesFor(sale.customer.phone, 'stage_rating_request');
    expect(sent.filter((one) => one.dedupe_key === `rating_reminder:${fresh?.id}`)).toHaveLength(1);
    // The 20-day-old ones are past the 14-day chase: no reminders for them.
    expect(sent).toHaveLength(1);
  });

  it('a rating unanswered for 30 days is cancelled as expired, with no message', async () => {
    const sale = await sellProject(admin, { name: 'Care Expiry (test)' });
    const [old] = await rate(sale.customer.customerId, 31);
    await runCare(NOON);
    const [row] = await rows<{ status: string; payload: Record<string, unknown> }>(
      'SELECT status::text AS status, payload FROM customer_actions WHERE id = $1',
      [old?.id],
    );
    expect(row?.status).toBe('cancelled');
    expect(row?.payload).toMatchObject({ expired: true, answer: 'expired' });
    expect(await templatesFor(sale.customer.phone, 'stage_rating_request')).toHaveLength(0);
  });
});
