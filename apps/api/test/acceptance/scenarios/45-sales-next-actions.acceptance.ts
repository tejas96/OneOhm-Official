import type { CommandCenter } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { addDays, createQuotation, newCustomer, sellProject, today } from '../support/sales';
import { alertsKeyed, ist, nextActionOf, runSalesChecks } from '../support/sales-checks';
import { sendInbound } from '../support/whatsapp';

// Live review B1–B3: after a quote is sent or accepted, a named person always has the
// next move. Sending sets "Follow up quote" in 2 days; accepting sets "Start project"
// today; a quote about to run out, or accepted with no project after a working day,
// raises one alert, once.
describe('Next actions after a quote is sent or accepted', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const sentQuote = async (name: string) => {
    const customer = await newCustomer(admin, { name });
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    return { customer, quotation };
  };
  const historyOf = async (leadId: string) =>
    (
      await rows<{ note: string }>(
        'SELECT note FROM lead_activities WHERE lead_id = $1 ORDER BY created_at, ctid',
        [leadId],
      )
    ).map((row) => row.note);
  const ownerOf = async (leadId: string) =>
    (
      await rows<{ owner: string }>('SELECT owner_user_id AS owner FROM leads WHERE id = $1', [
        leadId,
      ])
    )[0]?.owner;
  /** How many accepted quotes the command centre says have no project. */
  const startProjectsCount = async () => {
    const center = await admin.get<CommandCenter>('/command-center');
    const item = center.actions.find((action) => action.id === 'start-projects');
    return item ? Number.parseInt(item.title, 10) : 0;
  };

  it('sending a quote sets "Follow up quote" in 2 days, with a history line', async () => {
    const { customer, quotation } = await sentQuote('Follow Up Customer (test)');
    const day = addDays(today(), 2);
    expect(await nextActionOf(customer.leadId)).toEqual({
      day,
      time: null,
      note: `Follow up quote ${quotation.number}`,
    });
    expect(await historyOf(customer.leadId)).toContain(
      `Next action on ${day}: Follow up quote ${quotation.number}.`,
    );
  });

  it('"Send again" keeps a sooner next action the owner set after the first send', async () => {
    const { customer, quotation } = await sentQuote('Send Again Customer (test)');
    const sooner = { nextActionOn: today(), nextActionNote: 'Call before the visit (test)' };
    await admin.patch(`/leads/${customer.leadId}`, sooner);
    await admin.post(`/quotations/${quotation.id}/send`);
    expect(await nextActionOf(customer.leadId)).toEqual({
      day: today(),
      time: null,
      note: 'Call before the visit (test)',
    });
    const followUps = (await historyOf(customer.leadId)).filter((note) =>
      note.includes('Follow up quote'),
    );
    expect(followUps).toHaveLength(1);
  });

  it('a staff accept sets "Start project" today for the lead owner', async () => {
    const { customer, quotation } = await sentQuote('Staff Accept Customer (test)');
    await admin.post(`/quotations/${quotation.id}/accept`);
    expect(await nextActionOf(customer.leadId)).toEqual({
      day: today(),
      time: null,
      note: `Start project for ${quotation.number}`,
    });
    expect((await historyOf(customer.leadId)).at(-1)).toBe(
      `Next action on ${today()}: Start project for ${quotation.number}.`,
    );
  });

  it('the customer\'s yes on WhatsApp sets "Start project" today and promises the project manager', async () => {
    const { customer, quotation } = await sentQuote('WhatsApp Accept Customer (test)');
    await sendInbound(customer.phone, { buttonPayload: `quote_yes:${quotation.id}` });
    expect(await nextActionOf(customer.leadId)).toMatchObject({
      day: today(),
      note: `Start project for ${quotation.number}`,
    });
    const [thanks] = await rows<{ body: string }>(
      "SELECT payload->>'body' AS body FROM outbox WHERE dedupe_key = $1",
      [`quote_thanks:${quotation.id}`],
    );
    // Names who starts it (redesign §4 "After accept").
    expect(thanks?.body).toMatch(
      /^Thank you ✅ .+ will start your project and send the advance payment link today \(or the next working day\)\.$/,
    );
    expect(thanks?.body).not.toContain('Our team');
  });

  it('setting up the project clears "Start project" from the lead', async () => {
    const sale = await sellProject(admin, { name: 'Started Project Customer (test)' });
    expect(await nextActionOf(sale.customer.leadId)).toEqual({ day: null, time: null, note: null });
    expect((await historyOf(sale.customer.leadId)).at(-1)).toBe(
      `Done: Start project for ${sale.quotation.number}.`,
    );
  });

  it('the command centre counts accepted quotes without a project', async () => {
    const before = await startProjectsCount();
    const { quotation } = await sentQuote('Count Customer (test)');
    await admin.post(`/quotations/${quotation.id}/accept`);
    expect(await startProjectsCount()).toBe(before + 1);
    // A sale whose project is set up adds nothing.
    await sellProject(admin, { name: 'Counted Sale Customer (test)' });
    expect(await startProjectsCount()).toBe(before + 1);
  });

  it('a sent quote 3 days from running out alerts its owner once; accepted or lost never', async () => {
    const open = await sentQuote('Expiring Customer (test)');
    const closed = await sentQuote('Expiring Accepted Customer (test)');
    await admin.post(`/quotations/${closed.quotation.id}/accept`);
    const lost = await sentQuote('Expiring Lost Customer (test)');
    await rows(`UPDATE leads SET stage = 'lost' WHERE id = $1`, [lost.customer.leadId]);
    const validUntil = addDays(today(), 20);
    await rows('UPDATE quotations SET valid_until = $2 WHERE id = ANY($1::uuid[])', [
      [open.quotation.id, closed.quotation.id, lost.quotation.id],
      validUntil,
    ]);
    const key = (id: string) => `quote_validity:${id}`;

    await runSalesChecks(admin, ist(addDays(validUntil, -4), '12:00'));
    expect(await alertsKeyed(key(open.quotation.id))).toEqual([]);

    await runSalesChecks(admin, ist(addDays(validUntil, -3), '12:00'));
    const told = await alertsKeyed(key(open.quotation.id));
    expect(told.map((alert) => alert.user_id)).toEqual([await ownerOf(open.customer.leadId)]);
    expect(told[0]?.title).toContain(open.quotation.number);

    await runSalesChecks(admin, ist(addDays(validUntil, -2), '12:00'));
    expect(await alertsKeyed(key(open.quotation.id))).toHaveLength(1);
    expect(await alertsKeyed(key(closed.quotation.id))).toEqual([]);
    expect(await alertsKeyed(key(lost.quotation.id))).toEqual([]);
  });

  it('accepted with no project after 1 working day alerts the project setters once', async () => {
    const { quotation } = await sentQuote('No Project Customer (test)');
    await admin.post(`/quotations/${quotation.id}/accept`);
    const sale = await sellProject(admin, { name: 'Has Project Customer (test)' });
    const next = addDays(today(), 1);
    const key = `quote_no_project:${quotation.id}:`;

    // Still the next working day: not yet.
    await runSalesChecks(admin, ist(next, '18:00'));
    expect(await alertsKeyed(key)).toEqual([]);

    await runSalesChecks(admin, ist(next, '18:31'));
    const told = await alertsKeyed(key);
    const setters = await rows<{ id: string }>(
      `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL
         JOIN role_capabilities rc ON rc.role_id = r.id
        WHERE u.status = 'active' AND rc.capability = 'projects.create'`,
    );
    expect(told.length).toBeGreaterThan(0);
    for (const alert of told) expect(setters.map((row) => row.id)).toContain(alert.user_id);
    expect(new Set(told.map((alert) => alert.user_id)).size).toBe(told.length);

    await runSalesChecks(admin, ist(addDays(next, 1), '18:31'));
    expect(await alertsKeyed(key)).toHaveLength(told.length);
    expect(await alertsKeyed(`quote_no_project:${sale.quotation.id}:`)).toEqual([]);
  });
});
