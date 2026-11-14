import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filesOn, requestsOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, flowOf, formLinkOf, OLD, photo } from '../support/forms';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { chatOf, lastReply, replies, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat, setForm } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// The problem form's edge cases (audit): empty optionals, a note only, three photos, an old token, two
// homes, a held chat, typing instead of the form, and a form that comes while the chat questions run.

describe('Problem form: edges', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await setForm('report_problem', FLOW_ID);
  });
  afterAll(async () => {
    await setForm('report_problem', null);
    await closeDb();
  });

  async function opened(name: string) {
    const sale = await sellProject(admin, { name });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const form = await flowOf(phone);
    return { sale, phone, customerId: sale.customer.customerId, token: form?.token ?? '' };
  }

  it('nothing optional given: saved with no note, no photos and no stray fragments', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Empty (test)');
    await sendInbound(phone, {
      form: {
        token,
        photos: [],
        fields: { what: 'nopower', since: 'longer', note: '   ', home: '' },
      },
    });
    const [request] = await requestsOf(customerId);
    expect(request?.description).toBe('No power · for longer than a week');
    expect(request?.description).not.toMatch(/undefined|null|·\s*$|^\s*·|· ·/);
    expect(await filesOn(request?.id ?? '')).toHaveLength(0);
    expect((await lastReply(phone))?.body).toContain('Noted: *No power');
  });

  it('a note only is kept in the description; a very long one is cut, not lost to an error', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Note (test)');
    await sendInbound(phone, {
      form: { token, fields: { what: 'inverter', since: 'today', note: '  Red light  blinking ' } },
    });
    const [request] = await requestsOf(customerId);
    expect(request?.description).toBe('Inverter error · since today · Red light  blinking');
    const long = await opened('Problem Edge Long (test)');
    await sendInbound(long.phone, {
      form: {
        token: long.token,
        fields: { what: 'other', since: 'today', note: 'x'.repeat(3000) },
      },
    });
    const [big] = await requestsOf(long.customerId);
    expect(big?.description.length).toBeGreaterThan(100);
    expect(big?.description.length).toBeLessThanOrEqual(2000);
  });

  it('three photos are all linked to the request as site photos', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Photos (test)');
    await sendInbound(phone, {
      form: {
        token,
        photos: [photo('a'), photo('b'), photo('c')],
        fields: { what: 'damage', since: 'today' },
      },
    });
    const [request] = await requestsOf(customerId);
    const files = await filesOn(request?.id ?? '');
    expect(files.map((file) => file.category)).toEqual(['site_photo', 'site_photo', 'site_photo']);
    expect(await formLinkOf(phone)).toEqual({ kind: 'service_request', id: request?.id });
  });

  it('a photo that cannot be opened is told to the customer; the report still goes through', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Bad Photo (test)');
    const bad = { id: 'sample-wrong-type', file_name: 'x.pdf', mime_type: 'application/pdf' };
    await sendInbound(phone, {
      form: { token, photos: [photo('ok'), bad], fields: { what: 'bill', since: 'today' } },
    });
    const [request] = await requestsOf(customerId);
    expect(await filesOn(request?.id ?? '')).toHaveLength(1);
    const said = (await replies(phone)).map((reply) => reply.body);
    expect(said.some((line) => line.startsWith("We can't open this kind of file"))).toBe(true);
    expect(said.some((line) => line.includes('Noted: *Bill or meter'))).toBe(true);
  });

  it('the same form twice, a used or an expired token: one request, "That form is old"', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Twice (test)');
    const body = { token, fields: { what: 'cleaning', since: 'week' } };
    await Promise.allSettled([
      sendInbound(phone, { form: body }),
      sendInbound(phone, { form: body }),
    ]);
    await sendInbound(phone, { form: body });
    expect(await requestsOf(customerId)).toHaveLength(1);
    const old = (await replies(phone)).filter((reply) => reply.body === OLD);
    expect(old.length).toBeGreaterThanOrEqual(1);

    const other = await opened('Problem Edge Expired (test)');
    await rows(
      "UPDATE wa_flow_tokens SET expires_at = now() - interval '1 minute' WHERE token = $1",
      [other.token],
    );
    await sendInbound(other.phone, {
      form: { token: other.token, fields: { what: 'cleaning', since: 'week' } },
    });
    expect(await requestsOf(other.customerId)).toHaveLength(0);
    expect((await lastReply(other.phone))?.kind).not.toBe('flow');
    expect((await replies(other.phone)).some((reply) => reply.body === OLD)).toBe(true);
  });

  it('two homes: the one picked gets the request; an unknown home id is asked in the chat', async () => {
    const sale = await sellProject(admin, { name: 'Problem Edge Homes (test)' });
    const phone = sale.customer.phone;
    const second = await anotherHome(admin, sale.customer, 'Farm edge (test)');
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const form = await flowOf(phone);
    const titles = (form?.data.home_options as unknown as { id: string; title: string }[]) ?? [];
    // Two homes in one town stay tellable apart in the form.
    expect(new Set(titles.map((one) => one.title)).size).toBe(titles.length);
    await sendInbound(phone, {
      form: {
        token: form?.token ?? '',
        fields: { home: sale.project.id, what: 'nopower', since: 'today' },
      },
    });
    const [first] = await requestsOf(sale.customer.customerId);
    expect(first?.project_id).toBe(sale.project.id);

    await tap(phone, 'go:problem');
    const again = await flowOf(phone);
    await sendInbound(phone, {
      form: {
        token: again?.token ?? '',
        photos: [photo()],
        fields: { home: 'not-a-home', what: 'inverter', since: 'today', note: 'Beeping' },
      },
    });
    expect((await requestsOf(sale.customer.customerId)).length).toBe(1);
    expect((await lastReply(phone))?.body).toContain('Which home');
    await tap(phone, `home:${second.projectId}`);
    await tap(phone, 'pb:done');
    const [, raised] = await requestsOf(sale.customer.customerId);
    expect(raised).toMatchObject({ project_id: second.projectId, category: 'inverter_error' });
    expect(raised?.description).toBe('Inverter error · since today · Beeping');
    expect(await filesOn(raised?.id ?? '')).toHaveLength(1);
  });

  it('a person holds the chat: the request is still filed, the holder is told, the hold stays', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Held (test)');
    await rows(
      "UPDATE wa_conversations SET state = 'human', handled_by_user_id = $2, handed_over_at = now() WHERE phone = $1",
      [phone, admin.userId],
    );
    await sendInbound(phone, {
      form: { token, photos: [photo()], fields: { what: 'nopower', since: 'today', note: 'Held' } },
    });
    const [request] = await requestsOf(customerId);
    expect(request?.description).toBe('No power · since today · Held');
    expect(await filesOn(request?.id ?? '')).toHaveLength(1);
    expect((await chatOf(phone)).state).toBe('human');
    expect((await lastReply(phone))?.body).toContain('Noted: *No power');
    const chat = await chatOf(phone);
    const told = await rows<{ title: string; body: string }>(
      `SELECT title, body FROM notifications WHERE user_id = $1 AND kind = 'whatsapp_message'
         AND subject_id = $2`,
      [admin.userId, chat.id],
    );
    expect(told.some((note) => /Report a problem|problem/i.test(note.body))).toBe(true);

    // An old form in a held chat: the notice, and no Home from the bot.
    await sendInbound(phone, { form: { token, fields: { what: 'nopower', since: 'today' } } });
    const last = await lastReply(phone);
    expect(last?.body).toBe(OLD);
    expect(await requestsOf(customerId)).toHaveLength(1);
  });

  it('typing instead of opening the form works like the chat path and leaves no stuck state', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Typed (test)');
    await say(phone, 'My inverter is making a noise');
    expect((await chatOf(phone)).state).not.toBe('await_problem');
    await tap(phone, 'go:problem');
    const second = await flowOf(phone);
    expect(second?.token).not.toBe(token);
    await sendInbound(phone, {
      form: { token: second?.token ?? '', fields: { what: 'inverter', since: 'today' } },
    });
    expect(await requestsOf(customerId)).toHaveLength(1);
    // The first form was never used; it still files if the customer opens it later, once.
    await sendInbound(phone, { form: { token, fields: { what: 'other', since: 'week' } } });
    expect(await requestsOf(customerId)).toHaveLength(2);
  });

  it('a form arrives while the chat questions are half answered: the form wins, nothing is left waiting', async () => {
    const { phone, customerId, token } = await opened('Problem Edge Midway (test)');
    // The chat questions (no form published for a moment) are half answered when the old form comes.
    await setForm('report_problem', null);
    try {
      await tap(phone, 'go:problem');
      await tap(phone, 'pb:what:damage');
    } finally {
      await setForm('report_problem', FLOW_ID);
    }
    expect((await chatOf(phone)).state).toBe('await_problem');
    await sendInbound(phone, {
      form: { token, fields: { what: 'nopower', since: 'longer', note: 'From the form' } },
    });
    const [request] = await requestsOf(customerId);
    expect(request).toMatchObject({ category: 'no_generation' });
    expect(request?.description).toBe('No power · for longer than a week · From the form');
    expect((await chatOf(phone)).state).not.toBe('await_problem');
    // The half-answered chat report cannot raise a second request.
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    expect(await requestsOf(customerId)).toHaveLength(1);
  });
});
