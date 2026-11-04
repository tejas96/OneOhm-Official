import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { chatOf, choices, lastReply, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// "Which home is this for?" waits for a tap: small talk in between ("ok") gets its short
// word back and the question stays open (redesign §14, review fix round 2).
describe('Papers per home: small talk while "Which home?" waits', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('"ok" gets a short reply, the step stays, and the tap files the photo on that home', async () => {
    const { customer } = await sellProject(admin, { name: 'Which Home Talk (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'which-home-talk-1' } });
    const asked = await lastReply(customer.phone);
    expect(asked?.body).toBe('Which home is this for?');
    expect(choices(asked)).toContain(`fhome:${farm.propertyId}`);
    expect((await chatOf(customer.phone)).state).toBe('await_file_home');

    await say(customer.phone, 'ok');
    const reply = await lastReply(customer.phone);
    expect(reply?.kind).toBe('text');
    expect(reply?.body).toBe('Great 👍');
    expect((await chatOf(customer.phone)).state).toBe('await_file_home');

    await tap(customer.phone, `fhome:${farm.propertyId}`);
    const docs = await rows<{ project_id: string; property_id: string }>(
      'SELECT project_id, property_id FROM documents WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(docs).toEqual([{ project_id: farm.projectId, property_id: farm.propertyId }]);
  });
});
