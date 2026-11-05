import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, bodyOf, callTasks, PROMISE, requestsOf } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { setTemplate } from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, templatesFor } from '../support/send';

// "Fixed ✅ Is it working now?" (redesign §12): Yes goes on to the rating, Still a problem reopens.

describe('Problem: fixed check and reopen', () => {
  let admin: Session;
  let undoTemplate: () => Promise<unknown>;
  beforeAll(async () => {
    admin = await Session.admin();
    // The chat message follows the template's switch (it is on once Meta approved it).
    undoTemplate = await setTemplate('problem_fixed_check', true);
  });
  afterAll(async () => {
    await undoTemplate();
    await closeDb();
  });

  /** A problem raised through the chat and resolved by the desk; returns what the scenarios need. */
  async function resolved(name: string, options: { open?: boolean } = {}) {
    const sale = await sellProject(admin, { name });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:nopower');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    if (options.open === false) await closeChat(phone);
    await admin.patch(`/service-requests/${request?.id}`, { status: 'resolved' });
    return { sale, phone, requestId: request?.id ?? '' };
  }

  it('resolving asks "Is it working now?" with two buttons, once', async () => {
    const { sale, phone, requestId } = await resolved('Fixed Check (test)');
    const reply = await lastReply(phone);
    expect(reply?.body).toContain('Fixed ✅ Is it working now?');
    expect(reply?.buttons?.map((b) => b.title)).toEqual(['Yes, working', 'Still a problem']);
    const [ask] = await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed');
    expect(ask).toMatchObject({ status: 'open' });
    expect(ask?.payload.requestId).toBe(requestId);
    // Resolving again changes nothing: no second question.
    await admin.patch(`/service-requests/${requestId}`, { status: 'resolved' });
    expect(await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed')).toHaveLength(1);
  });

  it('Still a problem reopens it: open, the response clock restarts, the person is told, a call is promised', async () => {
    const { sale, phone, requestId } = await resolved('Reopen (test)');
    const [before] = await requestsOf(sale.customer.customerId);
    expect(before?.status).toBe('resolved');
    const reply = await lastReply(phone);
    await tap(phone, reply?.buttons?.[1]?.id ?? '');

    const [request] = await requestsOf(sale.customer.customerId);
    expect(request).toMatchObject({
      status: 'open',
      reopen_count: 1,
      resolved_at: null,
      responded_at: null,
    });
    expect(request?.response_due_at?.getTime()).toBeGreaterThan(Date.now());
    const told = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'service_reopened' AND subject_id = $1",
      [requestId],
    );
    expect(told.length).toBeGreaterThan(0);
    const said = await lastReply(phone);
    expect(said?.body).toMatch(
      /^Sorry about that\. We have opened your problem again\. \*.+\* will call you /,
    );
    expect(said?.body).toMatch(PROMISE);
    const tasks = await callTasks(sale.customer.customerId);
    expect(tasks.map((t) => t.payload.reason)).toContain('reopened');

    // Tapping the same button again is a no-op.
    const before2 = (await replies(phone)).length;
    await tap(phone, reply?.buttons?.[1]?.id ?? '');
    expect((await requestsOf(sale.customer.customerId))[0]?.reopen_count).toBe(1);
    expect((await replies(phone)).length).toBe(before2 + 1);
    expect(await bodyOf(phone)).toContain('we have noted it');

    // Fixed again: asked again (a new check for the new fix).
    await admin.patch(`/service-requests/${requestId}`, { status: 'resolved' });
    expect(await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed')).toHaveLength(2);
  });

  it('Yes, working opens the problem rating; five taps save it in the problem rating store', async () => {
    const { sale, phone, requestId } = await resolved('Fixed Yes (test)');
    const reply = await lastReply(phone);
    await tap(phone, reply?.buttons?.[0]?.id ?? '');
    const list = await lastReply(phone);
    expect(list?.kind).toBe('list');
    expect(list?.body).toContain('How was our help with');
    expect(list?.rows?.map((r) => r.id.slice(-2))).toEqual([':5', ':4', ':3', ':2', ':1']);
    await tap(phone, list?.rows?.[0]?.id ?? '');
    expect(await bodyOf(phone)).toContain('Thank you for rating us');
    const [rating] = await rows<{ rating: number }>(
      'SELECT rating FROM service_ratings WHERE service_request_id = $1',
      [requestId],
    );
    expect(rating?.rating).toBe(5);
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    expect(ask).toMatchObject({ status: 'closed' });
    // A second tap on the same list says it was rated already and changes nothing.
    await tap(phone, list?.rows?.[4]?.id ?? '');
    expect(await bodyOf(phone)).toContain('rated this already');
    const all = await rows('SELECT 1 FROM service_ratings WHERE service_request_id = $1', [
      requestId,
    ]);
    expect(all).toHaveLength(1);
  });

  it('outside 24 hours the template goes once it is on; while it is off the older update still goes, also in the chat', async () => {
    const { phone: closed } = await resolved('Fixed Template (test)', { open: false });
    const [sent] = await templatesFor(closed, 'problem_fixed_check');
    expect(sent?.payload.yesPayload).toMatch(/^fx:y:/);
    expect(sent?.payload.stillPayload).toMatch(/^fx:n:/);
    expect(await templatesFor(closed, 'service_update')).toHaveLength(0);

    await undoTemplate();
    undoTemplate = await setTemplate('problem_fixed_check', false);
    // Window open, switch off: no chat question, the older "resolved" update goes (C1).
    const { phone: open } = await resolved('Fixed Switch Off (test)');
    expect((await lastReply(open))?.body ?? '').not.toContain('Is it working now');
    expect((await templatesFor(open, 'service_update'))[0]?.payload.status).toBe('resolved');
    const { phone } = await resolved('Fixed Template Off (test)', { open: false });
    expect(await templatesFor(phone, 'problem_fixed_check')).toHaveLength(0);
    const [older] = await templatesFor(phone, 'service_update');
    expect(older?.payload.status).toBe('resolved');
  });
});
