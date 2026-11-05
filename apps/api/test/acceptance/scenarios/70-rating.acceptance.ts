import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asksOfKind, bodyOf, callTasks, PROMISE } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, optionsOf, sendTo, templatesFor } from '../support/send';
import { completeThrough } from '../support/tasks';

// One rating system (redesign §13, phase 6): five taps on WhatsApp for a finished stage and for a
// resolved problem; staff re-send only the pending one; 1 or 2 stars alert and make a call task.

describe('Rating: one system on WhatsApp', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** Both survey-stage steps done: the stage is finished, so the rating is asked. */
  async function finishSurvey(projectId: string) {
    await completeThrough(admin, projectId, 'electricity_details');
    await completeThrough(admin, projectId, 'site_survey');
  }

  /** A project whose survey stage is done: the stage rating is asked. */
  async function surveyDone(name: string, window: 'open' | 'closed') {
    const sale = await sellProject(admin, { name });
    await openChat(sale.customer.phone, sale.customer.customerId);
    if (window === 'closed') await closeChat(sale.customer.phone);
    await finishSurvey(sale.project.id);
    return sale;
  }

  it('a finished stage asks for the rating in the chat: five taps, not "rate it in the app"', async () => {
    const sale = await surveyDone('Rating Stage (test)', 'open');
    const phone = sale.customer.phone;
    const list = await lastReply(phone);
    expect(list?.kind).toBe('list');
    expect(list?.body).toBe('How was your site survey? Please tap a rating.');
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    expect(ask).toMatchObject({ status: 'open' });
    expect(ask?.payload).toMatchObject({ kind: 'stage', stage: 'survey' });
    expect(list?.rows?.map((r) => r.id)).toEqual([5, 4, 3, 2, 1].map((n) => `rt:${ask?.id}:${n}`));

    await tap(phone, `rt:${ask?.id}:4`);
    expect(await bodyOf(phone)).toContain('Thank you for rating us');
    const [saved] = await rows<{ rating: number; comment: string | null }>(
      "SELECT rating, comment FROM stage_ratings WHERE project_id = $1 AND stage = 'survey'",
      [sale.project.id],
    );
    expect(saved).toMatchObject({ rating: 4, comment: null });
    expect(await callTasks(sale.customer.customerId)).toHaveLength(0);
    // One store: tapping again changes nothing; the app sees it as rated.
    await tap(phone, `rt:${ask?.id}:1`);
    expect(await bodyOf(phone)).toContain('rated this already');
    const stages = await rows('SELECT 1 FROM stage_ratings WHERE project_id = $1', [
      sale.project.id,
    ]);
    expect(stages).toHaveLength(1);
  });

  it('1 or 2 stars: "Sorry to hear that", an alert and a call task with a promised time', async () => {
    const sale = await surveyDone('Rating Low (test)', 'open');
    const phone = sale.customer.phone;
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    await tap(phone, `rt:${ask?.id}:2`);
    const body = await bodyOf(phone);
    expect(body).toMatch(/^Sorry to hear that\. \*.+\* will call you /);
    expect(body).toMatch(PROMISE);
    const [task] = await callTasks(sale.customer.customerId);
    expect(task).toMatchObject({ status: 'received' });
    expect(task?.payload.reason).toBe('low_rating');
    expect(task?.title).toContain('2/5');
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'call_customer' AND dedupe_key LIKE $1",
      [`rating_low:${ask?.id}%`],
    );
    expect(alerts.length).toBeGreaterThan(0);
    const manager = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'stage_rating_low' AND subject_id = $1",
      [sale.project.id],
    );
    expect(manager.length).toBeGreaterThan(0);
  });

  it('outside 24 hours the template carries [Rate now]; its tap shows the five taps', async () => {
    const sale = await surveyDone('Rating Template (test)', 'closed');
    const phone = sale.customer.phone;
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    const [sent] = await templatesFor(phone, 'stage_rating_request');
    expect(sent?.payload).toMatchObject({ stageKey: 'survey', ratePayload: `rt:go:${ask?.id}` });
    await tap(phone, `rt:go:${ask?.id}`);
    expect((await lastReply(phone))?.kind).toBe('list');
  });

  it('"Ask for a rating" lists and re-sends only the pending one, never a second', async () => {
    const sale = await surveyDone('Rating Staff (test)', 'open');
    const phone = sale.customer.phone;
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    const offers = (await optionsOf(admin, { customerId: sale.customer.customerId })).offers.filter(
      (offer) => offer.action === 'ask_rating',
    );
    expect(offers).toHaveLength(1);
    expect(offers[0]?.request).toEqual({ action: 'ask_rating', actionId: ask?.id });
    await sendTo(
      admin,
      { customerId: sale.customer.customerId },
      { action: 'ask_rating', actionId: ask?.id ?? '' },
    );
    expect((await lastReply(phone))?.kind).toBe('list');
    expect(await asksOfKind(sale.customer.customerId, 'rating')).toHaveLength(1);

    // Rated: nothing to ask again.
    await tap(phone, `rt:${ask?.id}:5`);
    const after = await optionsOf(admin, { customerId: sale.customer.customerId });
    expect(after.offers.filter((offer) => offer.action === 'ask_rating')).toEqual([]);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { customerId: sale.customer.customerId },
      request: { action: 'ask_rating', actionId: ask?.id },
    });
    expect(refused.status).toBe(409);
  });

  it('"Rate us" in More opens the pending rating, or says there is none; the old comment step is gone', async () => {
    const sale = await sellProject(admin, { name: 'Rating More (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'go:feedback');
    expect(await bodyOf(phone)).toContain('Nothing is waiting for your rating');
    await finishSurvey(sale.project.id);
    await tap(phone, 'go:feedback');
    expect((await lastReply(phone))?.kind).toBe('list');
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    await tap(phone, `rt:${ask?.id}:5`);
    const [chat] = await rows<{ state: string }>(
      'SELECT state FROM wa_conversations WHERE phone = $1',
      [phone],
    );
    expect(chat?.state).toBe('menu');
  });

  it('in Marathi', async () => {
    const sale = await sellProject(admin, { name: 'Rating Marathi (test)' });
    const phone = sale.customer.phone;
    await openChat(phone, sale.customer.customerId);
    await tap(phone, 'lang:mr');
    await finishSurvey(sale.project.id);
    const list = await lastReply(phone);
    expect(list?.body).toContain('साइट सर्व्हे कसा वाटला');
    const [ask] = await asksOfKind(sale.customer.customerId, 'rating');
    await tap(phone, `rt:${ask?.id}:1`);
    expect(await bodyOf(phone)).toContain('हे ऐकून वाईट वाटले');
  });
});
