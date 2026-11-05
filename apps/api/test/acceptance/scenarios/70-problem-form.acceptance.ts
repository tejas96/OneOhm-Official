import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callerNameOf, callTasks, filesOn, optionIds, requestsOf } from '../support/care';
import { closeDb } from '../support/db';
import { FLOW_ID, flowOf, photo } from '../support/forms';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat, setForm } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// The report_problem form (redesign §12): choices and up to 3 photos in one screen, with the chat as fallback.

describe('Problem: the report form', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await setForm('report_problem', FLOW_ID);
  });
  afterAll(async () => {
    await setForm('report_problem', null);
    await closeDb();
  });

  it('opens the form on the PROBLEM screen; its answers raise the report at once', async () => {
    const sale = await sellProject(admin, { name: 'Problem Form (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const form = await flowOf(phone);
    expect(form).toMatchObject({ flowId: FLOW_ID, screen: 'PROBLEM', button: 'Report a problem' });
    expect(form?.data.ask_home).toBe(false);
    expect(optionIds(form?.data.what_options)).toEqual([
      'inverter',
      'nopower',
      'lowpower',
      'damage',
      'cleaning',
      'bill',
      'other',
    ]);
    expect(form?.fallbackText).toContain('What is wrong');

    await sendInbound(phone, {
      form: {
        token: form?.token ?? '',
        photos: [photo('a'), photo('b'), photo('c')],
        fields: { what: 'damage', since: 'longer', note: 'A panel is cracked (test)' },
      },
    });
    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({ category: 'physical_damage', project_id: sale.project.id });
    expect(request?.description).toBe(
      'Damage · for longer than a week · A panel is cracked (test)',
    );
    expect(await filesOn(request?.id ?? '')).toHaveLength(3);
    const saved = await lastReply(phone);
    expect(saved?.body).toContain('Noted: *Damage');
    expect(saved?.body).toContain(
      `*${await callerNameOf(admin, request?.assignee_user_id ?? null)}* will call you`,
    );
    expect(await callTasks(sale.customer.customerId)).toHaveLength(1);

    // The same form cannot raise it twice.
    await sendInbound(phone, {
      form: { token: form?.token ?? '', fields: { what: 'damage', since: 'today' } },
    });
    expect(await requestsOf(sale.customer.customerId)).toHaveLength(1);
  });

  it('asks for the home only with two or more, and files on the one picked', async () => {
    const sale = await sellProject(admin, { name: 'Problem Form Homes (test)' });
    const phone = sale.customer.phone;
    const second = await anotherHome(admin, sale.customer, 'Farm form (test)');
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const form = await flowOf(phone);
    expect(form?.data.ask_home).toBe(true);
    expect(optionIds(form?.data.home_options)).toContain(second.projectId);
    await sendInbound(phone, {
      form: {
        token: form?.token ?? '',
        fields: { home: second.projectId, what: 'bill', since: 'today' },
      },
    });
    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({ category: 'billing_net_meter', project_id: second.projectId });
  });

  it('an answer that misses a choice goes on in the chat; with no flow id the chat asks at once', async () => {
    const sale = await sellProject(admin, { name: 'Problem Form Gap (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    const form = await flowOf(phone);
    await sendInbound(phone, { form: { token: form?.token ?? '', fields: { what: 'cleaning' } } });
    expect(await requestsOf(sale.customer.customerId)).toHaveLength(0);
    const since = await lastReply(phone);
    expect(since?.buttons?.map((b) => b.id)).toEqual([
      'pb:since:today',
      'pb:since:week',
      'pb:since:longer',
    ]);

    await setForm('report_problem', null);
    try {
      const other = await sellProject(admin, { name: 'Problem No Form (test)' });
      await openChat(other.customer.phone, other.customer.customerId);
      await tap(other.customer.phone, 'go:problem');
      expect((await lastReply(other.customer.phone))?.kind).toBe('list');
    } finally {
      await setForm('report_problem', FLOW_ID);
    }
  });
});
