import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  handOverCount,
  lastReply,
  leadsOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Redesign §16 fixes for every issue of the old stranger and onboarding map (part-1 "Issues seen").
const EARLIER = 'That was an earlier message — here is the latest.';
const OPTIONS = ['ob:done:visit', 'ob:done:call', 'ob:done:notnow'];

describe('New contacts: the old issues are fixed', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune', 'Satara'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  async function estimated(phone: string) {
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:2000_3000');
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:1');
    await tap(phone, 'ob:photo:later');
    return (await chatOf(phone)).id;
  }

  it('1 2: after the estimate "ok", 👍, a reaction, a sticker or hi never hand over, and never loop', async () => {
    const phone = uniquePhone();
    const chatId = await estimated(phone);
    for (const message of [
      { text: 'ok' },
      { text: '👍' },
      { text: 'Thanks!' },
      { sticker: true },
    ]) {
      const before = (await replies(phone)).length;
      await sendInbound(phone, message);
      const said = await replies(phone);
      expect(said, JSON.stringify(message)).toHaveLength(before + 1);
      expect(said.at(-1)?.body).toBe('You are welcome! Tap an option whenever you are ready.');
    }
    const before = (await replies(phone)).length;
    await sendInbound(phone, { reaction: '👍' });
    expect(await replies(phone)).toHaveLength(before);
    // "hi" and Menu show the options again — once each, no alert.
    await say(phone, 'hi');
    expect(choices(await lastReply(phone))).toEqual(OPTIONS);
    await sendInbound(phone, { buttonReply: 'menu' });
    expect(choices(await lastReply(phone))).toEqual(OPTIONS);
    expect((await chatOf(phone)).state).toBe('onboard:done');
    expect(await handOverCount(chatId)).toBe(0);
    // Real words still reach a person.
    await say(phone, 'Can you come on Sunday for the visit?');
    expect((await chatOf(phone)).state).toBe('human');
    expect(await handOverCount(chatId)).toBe(1);
  });

  it('3 10: a reaction or sticker mid-onboarding is not an unclear answer; a bill after the estimate sends no buttons again', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await sendInbound(phone, { reaction: '🙏' });
    await sendInbound(phone, { sticker: true });
    await sendInbound(phone, { location: { latitude: 18.5, longitude: 73.8 } });
    expect((await chatOf(phone)).ob).toMatchObject({ misses: 0 });
    expect((await chatOf(phone)).state).toBe('onboard:site');
    expect(choices(await lastReply(phone))).toContain('ob:site:home');

    const done = uniquePhone();
    await estimated(done);
    const before = (await replies(done)).length;
    await sendInbound(done, { media: { type: 'image', fileId: 'bill-71' } });
    const after = (await replies(done)).slice(before);
    expect(after).toHaveLength(1);
    expect(after[0]?.buttons).toBeUndefined();
  });

  it('4 17: a stale tap — or one that arrives late — is told it is earlier, then the latest question is asked', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:city:Satara');
    await tap(phone, 'ob:city:Pune');
    const said = await replies(phone);
    expect(said.at(-2)?.body).toBe(EARLIER);
    expect(choices(said.at(-1))).toContain('ob:site:home');
  });

  it('5 6 7: a lead the team made hears its person named; Talk and Quick estimate work; onboarding off keeps bills and people', async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Team Made (test)',
      phone,
      city: 'Sangli',
      nextActionOn: today(),
    });
    await say(phone, 'hi');
    const hello = await lastReply(phone);
    expect(hello?.body).toMatch(/^Hi Team 👋 .+ from OneOhm is helping you\.$/);
    expect(hello?.body).not.toContain('not linked');
    await tap(phone, 'ob:quick');
    expect((await chatOf(phone)).state).toBe('onboard:language');
    expect(await leadsOf(phone)).toHaveLength(1);
    await tap(phone, 'ob:language:en');
    await tap(phone, 'ob:name:yes');
    expect((await chatOf(phone)).state).toBe('onboard:site');

    const off = await withOnboarding(admin, { enabled: false });
    try {
      const person = uniquePhone();
      await tap(person, 'human');
      const [lead] = await leadsOf(person);
      expect(lead).toMatchObject({ source: 'whatsapp' });
      expect((await chatOf(person)).state).toBe('human');
      expect((await lastReply(person))?.buttons?.map((b) => b.id)).toEqual(['menu']);
      // The person asks again while held: not swallowed, a person is told again.
      const count = (await replies(person)).length;
      await tap(person, 'ob:person');
      expect((await replies(person)).length).toBe(count + 1);
      expect(await leadsOf(person)).toHaveLength(1);
    } finally {
      await off();
    }
  });

  it('13: a stranger who said STOP and writes again is told once how to start again; STOP while held gets no night reply first', async () => {
    const phone = uniquePhone();
    await say(phone, 'stop');
    expect((await lastReply(phone))?.buttons?.map((b) => b.id)).toEqual(['start']);
    await say(phone, 'hello');
    const told = (await replies(phone)).filter((r) => r.body.includes('You stopped our WhatsApp'));
    expect(told).toHaveLength(1);
    await say(phone, 'are you there');
    expect(
      (await replies(phone)).filter((r) => r.body.includes('You stopped our WhatsApp')),
    ).toHaveLength(1);

    const held = uniquePhone();
    await upToSite(held);
    await tap(held, 'ob:person');
    const before = (await replies(held)).length;
    await say(held, 'stop');
    const after = (await replies(held)).slice(before);
    expect(after.map((r) => r.body)).toEqual([
      'You will not get WhatsApp messages from us now. Tap "Start again" whenever you want them back.',
    ]);
    const [chat] = await rows<{ opted: Date | null }>(
      'SELECT opted_out_at AS opted FROM wa_conversations WHERE phone = $1',
      [held],
    );
    expect(chat?.opted).not.toBeNull();
  });
});
