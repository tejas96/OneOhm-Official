import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { nudgesTo, runNudges, silentFor } from '../support/nudges';
import { chatOf, replies, say, tap, withOnboarding } from '../support/onboarding';
import { newCustomer, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Live review A7: STOP is answered once and honoured (flag on the chat and the customer,
// shown to staff, no onboarding nudge); START turns it back on. The worker's skip of
// templates for an opted-out number is covered by its unit test.
describe('WhatsApp STOP and START', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, {
      enabled: true,
      serviceCities: ['Pune'],
      nudgeAfterHours: 3,
    });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  const optedOutAt = async (phone: string) =>
    (
      await rows<{ at: Date | null }>(
        `SELECT opted_out_at AS at FROM wa_conversations WHERE phone = $1`,
        [phone],
      )
    )[0]?.at;
  const customerOptIn = async (phone: string) =>
    (
      await rows<{ on: boolean }>(
        `SELECT whatsapp_opt_in AS on FROM customers WHERE phone_e164 = $1`,
        [phone],
      )
    )[0]?.on;

  it('STOP gets one reply and the flag; staff see it; START brings it back', async () => {
    const customer = await newCustomer(admin, { name: 'Stop Customer (test)' });
    await sendInbound(customer.phone, { text: 'hi' });
    const before = (await replies(customer.phone)).length;

    await sendInbound(customer.phone, { text: ' Stop ' });
    const after = await replies(customer.phone);
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)?.body).toBe(
      'You will not get WhatsApp messages from us now. Tap "Start again" whenever you want them back.',
    );
    // Live QA round 2: the reply ends with a tap that starts the messages again.
    expect(after.at(-1)?.buttons).toEqual([{ id: 'start', title: 'Start again' }]);
    expect(await optedOutAt(customer.phone)).toBeTruthy();
    expect(await customerOptIn(customer.phone)).toBe(false);
    const chat = await chatOf(customer.phone);
    const detail = await admin.get<{ chat: { optedOut: boolean } }>(`/whatsapp/chats/${chat.id}`);
    expect(detail.chat.optedOut).toBe(true);

    await sendInbound(customer.phone, { text: 'START' });
    const back = await replies(customer.phone);
    expect(back).toHaveLength(before + 2);
    expect(back.at(-1)?.body).toBe('Welcome back! You will get updates here again.');
    expect(back.at(-1)?.buttons).toEqual([{ id: 'menu', title: 'Menu' }]);
    expect(await optedOutAt(customer.phone)).toBeNull();
    expect(await customerOptIn(customer.phone)).toBe(true);
  });

  it('the Start again tap starts the messages again, like typing START', async () => {
    const customer = await newCustomer(admin, { name: 'Start Tap Customer (test)' });
    await sendInbound(customer.phone, { text: 'STOP' });
    expect(await optedOutAt(customer.phone)).toBeTruthy();

    await sendInbound(customer.phone, { buttonReply: 'start' });

    expect(await optedOutAt(customer.phone)).toBeNull();
    expect(await customerOptIn(customer.phone)).toBe(true);
    expect((await replies(customer.phone)).at(-1)?.body).toBe(
      'Welcome back! You will get updates here again.',
    );
    // The bot's own tap: nobody on staff is told the customer wrote.
    const [logged] = await rows<{ mine: boolean }>(
      `select m.assistant_tap as mine from wa_messages m
         join wa_conversations c on c.id = m.conversation_id
        where c.phone = $1 and m.direction = 'in' order by m.created_at desc limit 1`,
      [customer.phone],
    );
    expect(logged?.mine).toBe(true);
  });

  it('START from someone who never stopped is just a hello', async () => {
    const phone = uniquePhone();
    await say(phone, 'start');
    expect(await optedOutAt(phone)).toBeNull();
    expect((await replies(phone)).at(-1)?.body).not.toBe(
      'Welcome back! You will get updates here again.',
    );
  });

  it('an onboarding chat that sent STOP is not nudged', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await sendInbound(phone, { text: 'stop' });
    expect(await optedOutAt(phone)).toBeTruthy();
    await silentFor(phone, 4);
    await runNudges(admin);
    expect(await nudgesTo(phone)).toHaveLength(0);
  });
});
