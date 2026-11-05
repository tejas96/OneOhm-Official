import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, callTasks, requestsOf, settleAdvance } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { NOON, setTemplate } from '../support/journey-steps';
import { lastReply, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat, setForm, templatesFor } from '../support/send';
import { completeThrough } from '../support/tasks';
import { runCare } from '../support/visit-worker';

// Review round 1 (phase 6): every care ask is on Home and chased (I1), the report form always offers the home (C3),
// the small gaps (M1 M2 M3 M4), and the AMC offer waits for its template (I5).

describe('Care: Home, reminders and the small gaps', () => {
  let admin: Session;
  const undos: (() => Promise<unknown>)[] = [];
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(async () => {
    for (const back of undos) await back();
    await setForm('report_problem', null);
    await closeDb();
  });

  const finishSurvey = async (projectId: string) => {
    await completeThrough(admin, projectId, 'electricity_details');
    await completeThrough(admin, projectId, 'site_survey');
  };
  const ageAsk = (id: string | undefined, days: number) =>
    rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      id,
      new Date(NOON.getTime() - days * 86_400_000),
    ]);

  it('a rating waits on Home with [Rate now], is chased at 2 days (not after STOP), and staff hear when the message is off', async () => {
    const sale = await sellProject(admin, { name: 'Care Rating Loop (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await finishSurvey(sale.project.id);
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    await settleAdvance(sale.project.id);
    await tap(phone, 'menu');
    const home = await lastReply(phone);
    expect(home?.body).toContain('Please rate your site survey.');
    expect(home?.buttons?.[0]).toMatchObject({ id: `rt:go:${ask?.id}`, title: 'Rate now' });

    await ageAsk(ask?.id, 3);
    await runCare(NOON);
    expect(
      (await templatesFor(phone, 'stage_rating_request')).filter(
        (m) => m.dedupe_key === `rating_reminder:${ask?.id}`,
      ),
    ).toHaveLength(1);
    await runCare(NOON);
    expect(
      (await templatesFor(phone, 'stage_rating_request')).filter(
        (m) => m.dedupe_key === `rating_reminder:${ask?.id}`,
      ),
    ).toHaveLength(1);

    const stopped = await sellProject(admin, { name: 'Care Rating Stop (test)' });
    await openChat(stopped.customer.phone, stopped.customer.customerId);
    await finishSurvey(stopped.project.id);
    const [stopAsk] = await asksOfKind(stopped.customer.customerId, 'rating');
    await say(stopped.customer.phone, 'STOP');
    await ageAsk(stopAsk?.id, 3);
    await runCare(NOON);
    expect(
      (await templatesFor(stopped.customer.phone, 'stage_rating_request')).filter((m) =>
        m.dedupe_key.startsWith('rating_reminder:'),
      ),
    ).toHaveLength(0);

    const off = await setTemplate('stage_rating_request', false);
    try {
      const quiet = await sellProject(admin, { name: 'Care Rating Off (test)' });
      await finishSurvey(quiet.project.id);
      const [quietAsk] = await asksOfKind(quiet.customer.customerId, 'rating');
      await ageAsk(quietAsk?.id, 3);
      await runCare(NOON);
      const alert = await rows(
        "SELECT 1 FROM notifications WHERE kind = 'rating_waiting' AND dedupe_key LIKE $1",
        [`rating_waiting:${quietAsk?.id}%`],
      );
      expect(alert.length).toBeGreaterThan(0);
    } finally {
      await off();
    }
  });

  it('the fixed check is on Home with [Answer now] and is chased once at 1 day', async () => {
    const on = await setTemplate('problem_fixed_check', true);
    undos.push(on);
    const sale = await sellProject(admin, { name: 'Care Fixed Loop (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:nopower');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    await admin.patch(`/service-requests/${request?.id}`, { status: 'resolved' });
    const [ask] = await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed');
    await settleAdvance(sale.project.id);
    await tap(phone, 'menu');
    const home = await lastReply(phone);
    expect(home?.body).toContain('Is it working now?');
    expect(home?.buttons?.[0]).toMatchObject({ id: `fx:show:${ask?.id}`, title: 'Answer now' });
    await tap(phone, `fx:show:${ask?.id}`);
    expect((await lastReply(phone))?.buttons?.map((b) => b.id)).toEqual([
      `fx:y:${ask?.id}`,
      `fx:n:${ask?.id}`,
    ]);

    await ageAsk(ask?.id, 2);
    await runCare(NOON);
    await runCare(NOON);
    const sent = (await templatesFor(phone, 'problem_fixed_check')).filter(
      (m) => m.dedupe_key === `fixed_reminder:${ask?.id}`,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({
      yesPayload: `fx:y:${ask?.id}`,
      stillPayload: `fx:n:${ask?.id}`,
    });
  });

  it('Still a problem on a request that is no longer resolved changes nothing and keeps the question open', async () => {
    const on = await setTemplate('problem_fixed_check', true);
    undos.push(on);
    const sale = await sellProject(admin, { name: 'Care Old Fixed (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:problem');
    await tap(phone, 'pb:what:cleaning');
    await tap(phone, 'pb:since:today');
    await tap(phone, 'pb:done');
    const [request] = await requestsOf(sale.customer.customerId);
    await admin.patch(`/service-requests/${request?.id}`, { status: 'resolved' });
    await admin.patch(`/service-requests/${request?.id}`, { status: 'in_progress' });
    const [ask] = await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed');
    await tap(phone, `fx:n:${ask?.id}`);
    expect(
      (await asksOfKind(sale.customer.customerId, 'confirm', 'problem_fixed'))[0]?.status,
    ).toBe('open');
    expect((await requestsOf(sale.customer.customerId))[0]?.reopen_count).toBe(0);
    expect(
      await callTasks(sale.customer.customerId).then((t) =>
        t.filter((x) => x.payload.reason === 'reopened'),
      ),
    ).toHaveLength(0);
  });
});
