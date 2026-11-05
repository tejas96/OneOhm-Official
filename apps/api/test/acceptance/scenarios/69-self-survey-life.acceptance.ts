import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { abandonSurveys } from '../../../../worker/src/activities/survey-abandon';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { NOON } from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { offerSurvey, sendWholeSurvey, surveysOf } from '../support/self-survey';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';
import { sendInbound } from '../support/whatsapp';

// The survey's loose ends (redesign §7): it is optional so it never counts as "a thing that needs you",
// the chat stops waiting when the customer leaves, an unfinished one is given up after 7 days, and the
// engineer finishing the step ends an open ask-again.

describe('Self survey: optional, abandoned, finished by the engineer', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const settle = (projectId: string) =>
    rows("UPDATE payment_milestones SET status = 'paid' WHERE project_id = $1 AND status = 'due'", [
      projectId,
    ]);

  it('Home does not count the survey as a thing that needs the customer, and a STOP customer is not offered it', async () => {
    const sale = await sellProject(admin, { name: 'Survey Optional (test)' });
    await offerSurvey(admin, sale);
    await tap(sale.customer.phone, 'menu');
    const home = await lastReply(sale.customer.phone);
    expect(home?.body).toContain('is due for your');
    expect(home?.body).not.toContain('things need you');
    expect(home?.body).not.toContain('site survey');
    await settle(sale.project.id);
    await tap(sale.customer.phone, 'menu');
    expect((await lastReply(sale.customer.phone))?.body).toContain('site survey');
    await rows('UPDATE customers SET whatsapp_opt_in = false WHERE id = $1', [
      sale.customer.customerId,
    ]);
    await tap(sale.customer.phone, 'menu');
    expect((await lastReply(sale.customer.phone))?.body ?? '').not.toContain('site survey');
  });

  it('Menu ends the wait for a photo; a second wrong consumer number falls through to normal chat', async () => {
    const sale = await sellProject(admin, { name: 'Survey Leaves (test)' });
    const { phone, customerId } = sale.customer;
    const { ask } = await offerSurvey(admin, sale);
    await tap(phone, `ss:go:${ask.id}`);
    await tap(phone, `ss:ans:${ask.id}:roof:rcc`);
    await tap(phone, `ss:ans:${ask.id}:floors:2`);
    expect((await surveysOf(customerId))[0]?.payload.awaiting).toBe('corner_a');
    await tap(phone, 'menu');
    expect((await surveysOf(customerId))[0]?.payload.awaiting).toBeNull();
    // A photo now is an ordinary chat file, not the survey's.
    await sendInbound(phone, { media: { type: 'image', fileId: `loose-${Date.now()}` } });
    expect((await surveysOf(customerId))[0]?.payload.photos).toEqual({});
    // The consumer number: one re-prompt, then it is ordinary talk.
    await rows(
      `UPDATE customer_actions SET payload = payload || '{"awaiting":"consumer"}'::jsonb WHERE id = $1`,
      [ask.id],
    );
    await sendInbound(phone, { text: '!!' });
    expect((await lastReply(phone))?.body).toContain('does not look like a consumer number');
    await sendInbound(phone, { text: '!!' });
    expect((await surveysOf(customerId))[0]?.payload.awaiting).toBeNull();
    expect((await lastReply(phone))?.body).not.toContain('does not look like a consumer number');
  });

  it('a started survey is given up 7 days after the start or the last ask-again; no one is told to call', async () => {
    const sale = await sellProject(admin, { name: 'Survey Abandon (test)' });
    const { ask } = await offerSurvey(admin, sale);
    await tap(sale.customer.phone, `ss:go:${ask.id}`);
    const db = acceptanceDb().db;
    const old = new Date(NOON.getTime() - 8 * 86_400_000);
    await rows(
      `UPDATE customer_actions SET created_at = $2, updated_at = $2,
         payload = jsonb_set(payload, '{startedAt}', to_jsonb($3::text)) WHERE id = $1`,
      [ask.id, old, old.toISOString()],
    );
    // The reminder counts from the start, and the team is not asked to call about an optional survey.
    await queueActionReminders(db, new Date(NOON.getTime() - 5 * 86_400_000), 'Asia/Kolkata');
    expect(
      await rows(
        "SELECT 1 FROM notifications WHERE kind = 'customer_action_waiting' AND dedupe_key = $1",
        [`action_waiting:${ask.id}`],
      ),
    ).toHaveLength(0);
    // An ask-again 2 days ago keeps it alive.
    await rows(
      `UPDATE customer_actions SET payload = jsonb_set(payload, '{askedAgainAt}', to_jsonb($2::text)) WHERE id = $1`,
      [ask.id, new Date(NOON.getTime() - 2 * 86_400_000).toISOString()],
    );
    await abandonSurveys(db, NOON);
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('open');
    await rows(`UPDATE customer_actions SET payload = payload - 'askedAgainAt' WHERE id = $1`, [
      ask.id,
    ]);
    await abandonSurveys(db, NOON);
    const [after] = await surveysOf(sale.customer.customerId);
    expect(after).toMatchObject({ status: 'cancelled' });
    expect(after?.payload.awaiting).toBeNull();
    expect(
      await rows(
        "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE 'Self survey abandoned%'",
        [sale.project.id],
      ),
    ).toHaveLength(1);
  });

  it('finishing the step while an ask-again is open cancels the ask and tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Survey Again Open (test)' });
    const { ask } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    await admin.post(`/self-surveys/${ask.id}/ask-again`, { items: ['meter'] });
    const detail = await project(admin, sale.project.id);
    const task = taskByKey(detail, 'site_survey');
    await workTask(admin, task, { facts: await surveyFacts(admin, detail, task), approve: true });
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('cancelled');
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      'Our engineer has finished your survey, so there is no need to send it now. Thank you.',
    );
    expect(
      (await replies(sale.customer.phone)).some((r) => r.body.startsWith('Survey approved')),
    ).toBe(false);
  });

  it('a tiled roof is not guessed as a structure; the engineer sets it at Approve', async () => {
    const sale = await sellProject(admin, { name: 'Survey Tiled (test)' });
    const { ask } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id, 'tile');
    const facts = await rows<{ key: string; value: string }>(
      'SELECT key, value FROM project_facts WHERE project_id = $1',
      [sale.project.id],
    );
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]));
    expect(byKey.self_survey_roof).toBe('Tiled roof');
    expect(byKey.structure_type).toBeUndefined();
  });
});
