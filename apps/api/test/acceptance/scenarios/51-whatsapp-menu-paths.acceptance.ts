import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { alerts, customerInChat, endsWithTaps, requestsOf, secondHome } from '../support/menu-chat';
import { milestoneOf } from '../support/money';
import { chatOf, choices, lastReply, replies, say, tap } from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';

// The WhatsApp menu audit (3 Nov 2026), end to end over the webhook: every path the
// customer taps ends with taps; a tap is never taken as the words a step waits for. Taps
// on the old menu ids still work (redesign decision 8). Held chats: 51-whatsapp-menu-holds;
// Home, small talk and unknown words: 61-whatsapp-home.
describe('WhatsApp menu paths', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('Raise a complaint: a tap while waiting is that tap; the words raise it on the home', async () => {
    const sale = await customerInChat(admin, 'Menu Complaint Customer (test)');
    const { phone, customerId } = sale.customer;

    await tap(phone, 'service');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('await_problem');

    // H1: a menu row tapped while the bot waits is that row, never the complaint.
    await tap(phone, 'requests');
    expect((await endsWithTaps(phone))?.body).toBe('You have not told us about any problem.');
    expect(await requestsOf(customerId)).toHaveLength(0);
    expect((await chatOf(phone)).state).toBe('menu');

    await tap(phone, 'service');
    await say(phone, 'ok');
    // Too short: asked again, with Menu to leave.
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, 'Inverter shows an error since morning (test)');
    expect(choices(await endsWithTaps(phone))).toEqual(['go:problems', 'menu']);
    const [raised] = await requestsOf(customerId);
    expect(raised?.project_id).toBe(sale.project.id);

    // My problems lists it, and ends with taps.
    await tap(phone, 'requests');
    expect((await endsWithTaps(phone))?.body).toContain('Inverter shows an error');
  });

  it('Raise a complaint with two homes asks which home first, then files on that one', async () => {
    const sale = await customerInChat(admin, 'Menu Two Homes Customer (test)');
    const { phone, customerId } = sale.customer;
    const pune = await secondHome(admin, sale);

    await tap(phone, 'service');
    const list = await endsWithTaps(phone);
    expect(list?.kind).toBe('list');
    expect(list?.body).toBe('Which home is the problem at?');
    expect(choices(list).sort()).toEqual([`home:${pune}`, `home:${sale.project.id}`].sort());
    expect(list?.rows?.map((row) => row.title)).toEqual(['Pune', 'Sangli']);

    await tap(phone, `home:${pune}`);
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, 'No power from the panels today (test)');
    const [raised] = await requestsOf(customerId);
    expect(raised?.project_id).toBe(pune);

    // F4: a home cancelled after the list was sent is said so; one home left is asked at once.
    await rows(`UPDATE projects SET status = 'cancelled' WHERE id = $1`, [pune]);
    await tap(phone, `home:${pune}`);
    const said = (await replies(phone)).slice(-2);
    expect(said[0]?.body).toBe('That home is no longer active.');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('await_problem');
  });

  it('Warranty and AMC, My rewards and Payments each end with taps', async () => {
    const { customer } = await customerInChat(admin, 'Menu Answers Customer (test)');
    const phone = customer.phone;

    await tap(phone, 'warranty');
    expect((await endsWithTaps(phone))?.body).toContain('switched on');
    await tap(phone, 'rewards');
    expect((await endsWithTaps(phone))?.body).toContain('not referred anyone');
    // Redesign §10: [Pay ₹X] [Receipts] [Menu]; the Pay tap answers with the pay link.
    await tap(phone, 'payments');
    const money = await endsWithTaps(phone);
    expect(money?.body).toContain('🔴');
    const [pay, ...rest] = choices(money);
    expect(pay).toMatch(/^pay:/);
    expect(rest).toEqual(['go:receipts', 'menu']);
    await tap(phone, pay ?? '');
    expect((await lastReply(phone))?.kind).toBe('cta_url');
  });

  it('Refer a friend: a tap while waiting is that tap; the friend is saved and shown', async () => {
    const { customer } = await customerInChat(admin, 'Menu Referral Customer (test)');
    const phone = customer.phone;

    await tap(phone, 'refer');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    // H2: a tap is not the friend's name and number.
    await tap(phone, 'rewards');
    expect((await endsWithTaps(phone))?.body).toContain('not referred anyone');
    expect((await chatOf(phone)).state).toBe('menu');

    await tap(phone, 'refer');
    await say(phone, 'no idea');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, `Suresh Patil ${uniquePhone().slice(-10)}`);
    expect((await endsWithTaps(phone))?.body).toContain('We will call Suresh');
    await tap(phone, 'rewards');
    expect((await endsWithTaps(phone))?.body).toContain('Suresh');
  });

  it('Talk to a person reaches a person with a Menu tap; unknown words get choices first', async () => {
    const { customer } = await customerInChat(admin, 'Menu Talk Customer (test)');
    const phone = customer.phone;
    const chat = await chatOf(phone);

    await tap(phone, 'human');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('human');
    await tap(phone, 'menu');

    // Redesign §14: words the bot does not know get choices; the second in a row, a person.
    await say(phone, 'Is the price the same as last week? (test)');
    const sorry = await endsWithTaps(phone);
    expect(sorry?.body).toBe('Sorry, we didn’t get that. Pick one below.');
    expect(choices(sorry)).toEqual(['go:talk', 'go:update', 'go:more']);
    expect((await chatOf(phone)).state).toBe('menu');
    await say(phone, 'Can you also fit a water heater? (test)');
    const reply = await endsWithTaps(phone);
    expect(reply?.body).toContain('will reply here');
    expect(choices(reply)).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('human');
    expect((await alerts(chat.id, 'whatsapp_handover')).length).toBeGreaterThan(0);
  });

  it('a cancelled home offers no Pay; an old receipt is still sent by View receipt', async () => {
    const sale = await customerInChat(admin, 'Menu Receipt Customer (test)');
    const { phone } = sale.customer;
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    for (let round = 0; round < 4; round += 1)
      await admin.post(`/projects/${sale.project.id}/payments`, {
        milestoneId: advance.id,
        amountPaise: 100_000,
        method: 'cash',
        receivedOn: today(),
        reference: `CASH-${round} (test)`,
      });
    const [oldest] = await rows<{ id: string; receipt_number: string }>(
      'SELECT id, receipt_number FROM payments WHERE project_id = $1 ORDER BY created_at LIMIT 1',
      [sale.project.id],
    );
    // M12: older than the newest three, and still sent itself.
    await tap(phone, `paper:receipt:${oldest?.id}`);
    const file = (await replies(phone)).filter((reply) => reply.kind === 'document').at(-1);
    expect(file?.caption).toContain(oldest?.receipt_number);
    // Redesign §11: the file with its caption, and no "What next?" after it.
    expect((await lastReply(phone))?.kind).toBe('document');

    // M7: with only a cancelled home there is no project to pay or track.
    await rows(`UPDATE projects SET status = 'cancelled' WHERE id = $1`, [sale.project.id]);
    await tap(phone, 'progress');
    expect(choices(await endsWithTaps(phone))).toEqual(['go:talk', 'menu']);
    await tap(phone, 'payments');
    expect((await lastReply(phone))?.kind).not.toBe('cta_url');
    expect(choices(await endsWithTaps(phone))).toEqual(['go:talk', 'menu']);
  });

  it('typed words from a lead the team made reach its person (menu audit M13)', async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Menu Staff Lead (test)',
      phone,
      city: 'Sangli',
      nextActionOn: today(),
    });
    await say(phone, 'Is the price the same as last week? (test)');
    const reply = await endsWithTaps(phone);
    expect(reply?.body).toContain('will reply here');
    expect(reply?.body).not.toContain('not linked');
    expect((await chatOf(phone)).state).toBe('human');

    // M4 and F5: the held stranger's own Call me back button is answered, with Menu.
    await tap(phone, 'callback');
    expect((await endsWithTaps(phone))?.body).toContain('call you soon');
    expect(choices(await lastReply(phone))).toEqual(['menu']);
  });
});
