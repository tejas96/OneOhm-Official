import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
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
import { uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Part 3, task 4 (fix round 1): every way an onboarding chat reaches a person ends in one
// alert and one reply, committed with the hand-over itself, and "change" at the name
// question means a new name, not the step before.
/** "… will reply here", in English or Marathi. */
// A named person takes the respectful plural (देतील), the team the singular (देईल).
const HANDED = ['will reply here', 'इथे उत्तर देईल', 'इथे उत्तर देतील'];
const handedReplies = async (phone: string) =>
  (await replies(phone)).filter((reply) => HANDED.some((words) => reply.body.includes(words)));

describe('Onboarding hand-overs', () => {
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

  /** Asserts the chat is with a person after exactly one alert and one reply. */
  async function handedOnce(phone: string) {
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect(await handOverCount(chat.id)).toBe(1);
    expect(await handedReplies(phone)).toHaveLength(1);
  }

  it('two quick "Talk to a person" taps give one alert and one reply', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await Promise.all([tap(phone, 'ob:person'), tap(phone, 'ob:person')]);
    await handedOnce(phone);
  });

  it('typing "talk to a person" in English or Marathi hands over', async () => {
    const english = uniquePhone();
    await upToSite(english);
    await say(english, 'Talk to a person');
    await handedOnce(english);

    const marathi = uniquePhone();
    await say(marathi, 'hi');
    await tap(marathi, 'ob:language:mr');
    await say(marathi, 'मला टीमशी बोलायचे आहे');
    await handedOnce(marathi);
  });

  it('the old call-back and person buttons hand an onboarding chat over', async () => {
    const callback = uniquePhone();
    await upToSite(callback);
    await tap(callback, 'ob:site:home');
    await sendInbound(callback, { buttonReply: 'callback' });
    await handedOnce(callback);

    const human = uniquePhone();
    await say(human, 'hi');
    await tap(human, 'ob:language:en');
    await sendInbound(human, { buttonReply: 'human' });
    await handedOnce(human);
  });

  it('"बदला" at the name question asks for the name; the typed name goes on the lead', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:mr');
    await say(phone, 'बदला');
    expect((await chatOf(phone)).state).toBe('onboard:name');
    expect(choices(await lastReply(phone))).toEqual(['ob:name:back', 'ob:person']);
    await say(phone, 'Ravi Patil');
    expect((await chatOf(phone)).state).toBe('onboard:city');
    await tap(phone, 'ob:city:Pune');
    expect((await leadsOf(phone))[0]?.name).toBe('Ravi Patil');
  });
});
