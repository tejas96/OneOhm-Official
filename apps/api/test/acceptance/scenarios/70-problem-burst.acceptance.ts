import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filesOn, requestsOf, sendPhoto } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat } from '../support/send';

// Three photos that reach the webhook together (WhatsApp delivers a burst within a second) all stay
// with the report: each one is added under the chat's lock, the question is asked once, and the third
// photo raises it with every photo linked.

const ASK = 'Send up to 3 photos or a few words if you like, then tap Done.';

describe('Problem: three photos at once', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('links all three, asks once, leaves no loose file', async () => {
    const sale = await sellProject(admin, { name: 'Photo Burst (test)' });
    const phone = sale.customer.phone;
    const customerId = sale.customer.customerId;
    await openChat(phone, customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:inverter');
    await tap(phone, 'pb:since:today');
    const before = (await replies(phone)).length;

    await Promise.all([sendPhoto(phone), sendPhoto(phone), sendPhoto(phone)]);

    const [request] = await requestsOf(customerId);
    expect(request).toMatchObject({ category: 'inverter_error', status: 'open' });
    expect(await requestsOf(customerId)).toHaveLength(1);
    expect(await filesOn(request?.id ?? '')).toHaveLength(3);
    expect((await filesOn(request?.id ?? '')).every((f) => f.category === 'site_photo')).toBe(true);
    const loose = await rows<{ id: string }>(
      `SELECT id FROM documents WHERE customer_id = $1 AND service_request_id IS NULL AND category = 'other'`,
      [customerId],
    );
    expect(loose).toHaveLength(0);
    const said = (await replies(phone)).slice(before);
    expect(said.filter((r) => r.body === ASK)).toHaveLength(1);
  });
});
