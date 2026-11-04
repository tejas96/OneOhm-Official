import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  handOverAlerts,
  lastReply,
  leadsOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { newCustomer, sellProject, today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Live review C5, C10–C14: what a homeowner sees on WhatsApp. The bot welcomes them by
// name of the company, every list after the first question has a Back row, a voice note
// goes warmly to a person, a file is "received" (never "your bill"), and a customer
// moves around by taps or plain Marathi words, never special English words.
describe('Customer clarity on WhatsApp', () => {
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

  it('C10, C14: the welcome, then a Back row that goes back one question', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    const welcome = await lastReply(phone);
    expect(welcome?.body.split('\n')[0]).toBe('Welcome to OneOhm Solar 🙏');
    expect(choices(welcome)).toEqual(['ob:language:en', 'ob:language:mr', 'ob:language:hi']);
    await tap(phone, 'ob:language:mr');
    await tap(phone, 'ob:name:yes');
    const cities = await lastReply(phone);
    expect(choices(cities).slice(-2)).toEqual(['ob:city:back', 'ob:person']);
    expect(cities?.rows?.at(-2)?.title).toBe('मागे');
    await tap(phone, 'ob:city:Pune');
    expect(choices(await lastReply(phone))).toContain('ob:site:back');
    await tap(phone, 'ob:site:back');
    expect((await chatOf(phone)).state).toBe('onboard:city');
    expect(choices(await lastReply(phone))).toContain('ob:city:Pune');
  });

  it('C11: a file is "received — our team will check it", never "your bill"', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await sendInbound(phone, {
      media: {
        type: 'document',
        fileId: 'layout-1',
        mimeType: 'application/pdf',
        filename: 'x.pdf',
      },
    });
    const said = (
      await rows<{ body: string }>(
        `SELECT payload->>'body' AS body FROM outbox WHERE recipient = $1 AND template = 'session:text'
        ORDER BY created_at DESC LIMIT 1`,
        [phone],
      )
    )[0]?.body;
    expect(said).toBe('Thank you. File received — our team will check it.');
  });

  it('C12: a voice note during onboarding goes warmly to a person, with a lead', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await sendInbound(phone, {
      media: { type: 'audio', fileId: 'voice-1', mimeType: 'audio/ogg' },
    });
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect((await lastReply(phone))?.body).toContain('Thank you for the voice note.');
    expect(await leadsOf(phone)).toHaveLength(1);
    const alerts = await handOverAlerts(chat.id);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.body).toContain('Sent a voice note');
  });

  it('C5: a customer types Marathi words and every answer ends with taps', async () => {
    const { customer } = await sellProject(admin, { name: 'tejas clarity (test)' });
    await sendInbound(customer.phone, { text: 'मेनू' });
    const menu = await lastReply(customer.phone);
    expect(menu?.kind).toBe('list');
    expect(menu?.body).toContain('Tejas');
    expect(menu?.body).not.toContain('"menu"');
    await sendInbound(customer.phone, { text: 'कागद' });
    // The only paper (the quote) goes as the file, then Menu · Talk to us (live QA round 2).
    const [file, papers] = (await replies(customer.phone)).slice(-2);
    expect(file?.kind).toBe('document');
    expect(papers?.kind).toBe('buttons');
    expect(choices(papers)).toEqual(['menu', 'human']);
    await sendInbound(customer.phone, { buttonReply: 'progress' });
    expect(choices(await lastReply(customer.phone))).toEqual(['menu', 'payments', 'human']);
    await sendInbound(customer.phone, { buttonReply: 'menu' });
    expect((await lastReply(customer.phone))?.kind).toBe('list');
  });

  // Fix round 1: with no project yet, Pay now and Track my project would lead nowhere.
  it('C5: a customer with no project gets only Menu and Talk to us', async () => {
    const customer = await newCustomer(admin, { name: 'No Project Clarity (test)' });
    for (const text of ['progress', 'payments']) {
      await sendInbound(customer.phone, { text });
      expect(choices(await lastReply(customer.phone)), text).toEqual(['menu', 'human']);
    }
  });

  it('C12: a voice note or a video from a team-made lead goes warmly to their person', async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Team Lead Voice (test)',
      phone,
      city: 'Pune',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    await sendInbound(phone, {
      media: { type: 'video', fileId: 'video-1', mimeType: 'video/mp4' },
    });
    expect((await chatOf(phone)).state).toBe('human');
    expect((await lastReply(phone))?.body).toMatch(/^Thank you for the video\. .+ will watch it/);
    const alerts = await handOverAlerts((await chatOf(phone)).id);
    expect(alerts[0]?.body).toContain('Sent a video');
  });

  it('C14: Back from typing a city goes back to the city list', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await tap(phone, 'ob:name:yes');
    await tap(phone, 'ob:city:other');
    expect(choices(await lastReply(phone))).toEqual(['ob:city:back', 'ob:person']);
    await sendInbound(phone, { buttonReply: 'ob:city:back' });
    expect(choices(await lastReply(phone))).toContain('ob:city:Pune');
    expect((await chatOf(phone)).state).toBe('onboard:city');
  });
});
