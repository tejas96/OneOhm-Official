import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bodyOf,
  callerNameOf,
  callTasks,
  filesOn,
  PROMISE,
  requestsOf,
  sendPhoto,
  sendVoice,
} from '../support/care';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { lastReply, replies, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat } from '../support/send';

// Report a problem in the chat (redesign §12, phase 6): one tap at a time, the category is the tap,
// the reply names who calls and when, and a call task stands behind that promise.

describe('Problem: reported in the chat', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('home is skipped for one home; what is wrong and since when are taps; photos and Done close it', async () => {
    const sale = await sellProject(admin, { name: 'Problem Chat (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const what = await lastReply(phone);
    expect(what?.kind).toBe('list');
    expect(what?.rows?.map((r) => r.title)).toEqual([
      'Inverter error',
      'No power',
      'Low power',
      'Damage',
      'Cleaning',
      'Bill or meter',
      'Something else',
    ]);
    await tap(phone, 'pb:what:inverter');
    expect((await lastReply(phone))?.buttons?.map((b) => b.title)).toEqual([
      'Today',
      'This week',
      'Longer',
    ]);
    await tap(phone, 'pb:since:week');
    expect((await lastReply(phone))?.buttons?.map((b) => b.title)).toEqual(['Done']);
    await sendPhoto(phone);
    await sendPhoto(phone);
    // Nothing is raised until Done: the photos wait in the report.
    expect(await requestsOf(sale.customer.customerId)).toHaveLength(0);
    await tap(phone, 'pb:done');

    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({ category: 'inverter_error', status: 'open' });
    expect(request?.description).toBe('Inverter error · since this week');
    expect(request?.project_id).toBe(sale.project.id);
    expect(await filesOn(request?.id ?? '')).toHaveLength(2);

    const saved = await lastReply(phone);
    expect(saved?.body).toMatch(
      /^Thank you ✅ Noted: \*Inverter error · .+\*\. \*.+\* will call you /,
    );
    expect(saved?.body).toContain(
      `*${await callerNameOf(admin, request?.assignee_user_id ?? null)}*`,
    );
    expect(saved?.body).toMatch(PROMISE);
    expect(saved?.buttons?.map((b) => b.title)).toEqual(['My problems', 'Menu']);

    const [task] = await callTasks(sale.customer.customerId);
    expect(task).toMatchObject({ status: 'received' });
    expect(task?.payload).toMatchObject({ reason: 'problem', once: `call:problem:${request?.id}` });
    // The old text flow is gone: nothing says "(via WhatsApp)" and nothing was guessed.
    expect(request?.description).not.toContain('via WhatsApp');
  });

  it('words typed before the questions are answered do not raise it; the question comes back', async () => {
    const sale = await sellProject(admin, { name: 'Problem Words (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await say(phone, 'my inverter is beeping and shows error 21');
    expect((await lastReply(phone))?.kind).toBe('list');
    expect(await requestsOf(sale.customer.customerId)).toHaveLength(0);
    await tap(phone, 'pb:what:other');
    await tap(phone, 'pb:since:today');
    // Words after both taps are the "anything to add".
    await say(phone, 'Beeping since the morning (test)');
    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({ category: 'other' });
    expect(request?.description).toBe(
      'Something else · since today · Beeping since the morning (test)',
    );
  });

  it('a customer with two homes picks the home first', async () => {
    const sale = await sellProject(admin, { name: 'Problem Two Homes (test)' });
    const phone = sale.customer.phone;
    const second = await anotherHome(admin, sale.customer, 'Farm (test)');
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const homes = await lastReply(phone);
    expect(homes?.rows).toHaveLength(2);
    await tap(phone, `home:${second.projectId}`);
    await tap(phone, 'pb:what:damage');
    await tap(phone, 'pb:since:longer');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({ category: 'physical_damage', project_id: second.projectId });
  });

  it('speaks Marathi', async () => {
    const sale = await sellProject(admin, { name: 'Problem Marathi (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'lang:mr');
    await tap(phone, 'go:problem');
    expect((await lastReply(phone))?.rows?.[0]?.title).toBe('इन्व्हर्टर एरर');
    await tap(phone, 'pb:what:nopower');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    expect(await bodyOf(phone)).toContain('धन्यवाद ✅ नोंद केली: *वीज निर्मिती बंद');
  });

  it('a voice note after the report joins it; it does not hand the chat over', async () => {
    const sale = await sellProject(admin, { name: 'Problem Voice (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:lowpower');
    await tap(phone, 'pb:since:week');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    await sendVoice(phone);
    expect(await bodyOf(phone)).toContain(
      `${await callerNameOf(admin, request?.assignee_user_id ?? null)} will listen to it`,
    );
    const files = await filesOn(request?.id ?? '');
    expect(files.map((f) => f.category)).toEqual(['voice_note']);
    const [chat] = await rows<{ state: string }>(
      'SELECT state FROM wa_conversations WHERE phone = $1',
      [phone],
    );
    expect(chat?.state).not.toBe('human');
    expect(
      (await replies(phone)).some((r) => r.body?.includes('voice note') && r.kind === 'buttons'),
    ).toBe(true);
  });

  it('a voice note during the questions is kept and joins the report when it is raised', async () => {
    const sale = await sellProject(admin, { name: 'Problem Voice Early (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await sendVoice(phone);
    expect((await lastReply(phone))?.kind).toBe('list');
    await tap(phone, 'pb:what:cleaning');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    expect((await filesOn(request?.id ?? '')).map((f) => f.category)).toEqual(['voice_note']);
  });
});
