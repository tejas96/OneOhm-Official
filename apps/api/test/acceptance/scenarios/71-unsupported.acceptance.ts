import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { chatOf, lastReply, replies, say, tap, withOnboarding } from '../support/onboarding';
import { sellProject, uniquePhone } from '../support/sales';
import { openChat } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// A message WhatsApp cannot pass on (type "unsupported") is answered once per burst: never silence.

const SORRY = 'Sorry, we couldn’t open that. Please send it again as a photo, PDF or text.';

describe('Unsupported messages', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('a customer hears sorry with More and Talk to {name}, once for a burst', async () => {
    const sale = await sellProject(admin, { name: 'Unsupported (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await sendInbound(phone, { unsupported: true });
    const said = await lastReply(phone);
    expect(said?.body).toBe(SORRY);
    expect(said?.buttons?.map((b) => b.id)).toEqual(['go:more', 'go:talk']);
    expect(said?.buttons?.[0]?.title).toBe('More');
    expect(said?.buttons?.[1]?.title).toMatch(/^Talk to \S+/);
    const count = (await replies(phone)).length;
    await sendInbound(phone, { unsupported: true });
    await sendInbound(phone, { unsupported: true });
    expect((await replies(phone)).length).toBe(count);
    expect((await chatOf(phone)).state).not.toBe('human');
  });

  it('is answered in Marathi', async () => {
    const sale = await sellProject(admin, { name: 'Unsupported Marathi (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'lang:mr');
    await sendInbound(phone, { unsupported: true });
    expect((await lastReply(phone))?.body).toBe(
      'माफ करा, आम्हाला ते उघडता आले नाही. कृपया ते फोटो, PDF किंवा मजकूर म्हणून पुन्हा पाठवा.',
    );
  });

  it('a chat a person holds stays quiet', async () => {
    const sale = await sellProject(admin, { name: 'Unsupported Held (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:talk');
    expect((await chatOf(phone)).state).toBe('human');
    const count = (await replies(phone)).length;
    await sendInbound(phone, { unsupported: true });
    expect((await replies(phone)).length).toBe(count);
  });

  it('a stranger in onboarding hears sorry, then the question they were on', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    const question = await lastReply(phone);
    const count = (await replies(phone)).length;
    await sendInbound(phone, { unsupported: true });
    const after = await replies(phone);
    expect(after.slice(count)).toHaveLength(2);
    expect(after[count]?.body).toBe(SORRY);
    expect(after.at(-1)?.body).toBe(question?.body);
  });
});
