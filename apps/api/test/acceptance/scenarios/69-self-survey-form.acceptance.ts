import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { FLOW_ID } from '../support/forms';
import { Session } from '../support/http';
import { choices, lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import {
  ANSWERS,
  offerSurvey,
  photos,
  publishSurvey,
  startedForm,
  surveysOf,
} from '../support/self-survey';
import { sendInbound } from '../support/whatsapp';

// The survey form and its chat fallback (redesign §7): the answers and four photos become the survey
// report fields and site photos on the survey step; the step shows "Self survey received".

describe('Self survey: the form and the chat', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(async () => {
    await publishSurvey(null);
    await closeDb();
  });

  it('opens the form with words and options, and a complete reply is saved as the survey report', async () => {
    await publishSurvey(FLOW_ID);
    const sale = await sellProject(admin, { name: 'Survey Form (test)' });
    const { customer, project } = sale;
    const { ask, taskId } = await offerSurvey(admin, sale);
    const flow = await startedForm(customer.phone, ask.id);
    expect(flow).toMatchObject({ flowId: FLOW_ID, screen: 'ROOF', button: 'Start survey' });
    const data = flow?.data as unknown as Record<string, unknown>;
    expect(data.roof_label).toBe('Roof type');
    expect(data.ask_consumer).toBe(true);
    expect(data.shade_options).toEqual([
      { id: 'none', title: 'No shade' },
      { id: 'morning', title: 'Some in the morning' },
      { id: 'evening', title: 'Some in the evening' },
      { id: 'lot', title: 'A lot of shade' },
    ]);
    expect(flow?.body).toContain('Or just answer here in the chat.');

    await sendInbound(customer.phone, {
      form: {
        token: flow?.token ?? '',
        fields: { ...ANSWERS, consumer: '1234 5678 90', ...photos() },
      },
    });
    const [saved] = await surveysOf(customer.customerId);
    expect(saved).toMatchObject({ status: 'received' });
    expect(saved?.payload.answers).toMatchObject({
      roof: 'rcc',
      floors: '2',
      consumer: '1234567890',
    });
    expect(Object.keys(saved?.payload.photos ?? {}).sort()).toEqual([
      'board',
      'corner_a',
      'corner_b',
      'meter',
    ]);
    expect(
      (await replies(customer.phone)).some((r) =>
        r.body.startsWith('Thank you ✅ We have your survey'),
      ),
    ).toBe(true);

    // Report fields and site photos on the survey step, with captions.
    const facts = await rows<{ key: string; value: string }>(
      'SELECT key, value FROM project_facts WHERE project_id = $1 ORDER BY key',
      [project.id],
    );
    expect(Object.fromEntries(facts.map((f) => [f.key, f.value]))).toMatchObject({
      site_floors: '2',
      structure_type: 'RCC roof',
      self_survey_shade: 'Some shade in the morning',
      self_survey_roof_size: '300 to 600 sq ft',
    });
    const photosOnTask = await rows<{ name: string; category: string; project_id: string }>(
      'SELECT name, category, project_id FROM documents WHERE task_id = $1 AND removed_at IS NULL ORDER BY name',
      [taskId],
    );
    expect(photosOnTask.map((p) => p.name.replace(/\.\w+$/, ''))).toEqual([
      'Self survey: electricity meter',
      'Self survey: main switch board',
      'Self survey: roof corner A',
      'Self survey: roof corner B',
    ]);
    for (const p of photosOnTask)
      expect(p).toMatchObject({ category: 'site_photo', project_id: project.id });
    // The step's owner is told; the card reads it as waiting for the check.
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'self_survey_received' AND subject_id = $1",
      [taskId],
    );
    expect(alert).toBeDefined();
    const view = await admin.get<{
      status: string;
      missing: string[];
      photos: unknown[];
      canCheck: boolean;
    }>(`/self-surveys?taskId=${taskId}`);
    expect(view).toMatchObject({ status: 'received', missing: [], canCheck: true });
    expect(view.photos).toHaveLength(4);
    // The home has no location: the 📍 ask follows once.
    const location = (await replies(customer.phone)).filter((r) => r.body.includes('location'));
    expect(location.length).toBeGreaterThan(0);
    const asks = await rows(
      "SELECT 1 FROM customer_actions WHERE customer_id = $1 AND type = 'location'",
      [customer.customerId],
    );
    expect(asks).toHaveLength(1);
    // The token is used once.
    await sendInbound(customer.phone, { form: { token: flow?.token ?? '', fields: ANSWERS } });
    expect((await lastReply(customer.phone))?.body).toBeDefined();
    expect(await surveysOf(customer.customerId)).toHaveLength(1);
  });

  it('a form reply with a photo missing asks only for that photo in the chat', async () => {
    await publishSurvey(FLOW_ID);
    const sale = await sellProject(admin, { name: 'Survey Partial (test)' });
    const { ask } = await offerSurvey(admin, sale);
    const flow = await startedForm(sale.customer.phone, ask.id);
    const { meter: _meter, ...rest } = photos();
    await sendInbound(sale.customer.phone, {
      form: { token: flow?.token ?? '', fields: { ...ANSWERS, consumer: 'MH123456', ...rest } },
    });
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('open');
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      'Please send a photo of your electricity meter. The meter number must be readable.',
    );
    await sendInbound(sale.customer.phone, {
      media: { type: 'image', fileId: `meter-${Date.now()}` },
    });
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('received');
  });

  it('with no form published the chat asks one thing at a time and store-once photos arrive here', async () => {
    await publishSurvey(null);
    const sale = await sellProject(admin, { name: 'Survey Chat (test)' });
    const { customer } = sale;
    const { ask } = await offerSurvey(admin, sale);
    await tap(customer.phone, `ss:go:${ask.id}`);
    let reply = await lastReply(customer.phone);
    expect(reply?.body).toBe('What is your roof made of?');
    expect(reply?.rows?.map((r) => r.title)).toEqual([
      'RCC (concrete)',
      'Tin shed',
      'Tiled roof',
      'Other',
    ]);
    await tap(customer.phone, choices(reply)[1] ?? '');
    reply = await lastReply(customer.phone);
    expect(reply?.body).toBe('How many floors does your building have?');
    await tap(customer.phone, choices(reply)[1] ?? '');
    expect((await lastReply(customer.phone))?.body).toContain('corner of your roof (corner A)');
    // A word instead of a photo does not move on; a photo does.
    for (const item of ['a', 'b', 'meter', 'board'])
      await sendInbound(customer.phone, {
        media: { type: 'image', fileId: `chat-${item}-${Date.now()}` },
      });
    reply = await lastReply(customer.phone);
    expect(reply?.body).toBe('Does shade fall on your roof?');
    await tap(customer.phone, choices(reply)[0] ?? '');
    reply = await lastReply(customer.phone);
    expect(reply?.body).toBe('About how big is your roof?');
    await tap(customer.phone, choices(reply)[4] ?? '');
    expect((await lastReply(customer.phone))?.body).toBe(
      'Please type your electricity consumer number. It is on your bill.',
    );
    await sendInbound(customer.phone, { text: '!!' });
    expect((await lastReply(customer.phone))?.body).toContain(
      'does not look like a consumer number',
    );
    await sendInbound(customer.phone, { text: 'MH 123 456 789' });
    const [saved] = await surveysOf(customer.customerId);
    expect(saved).toMatchObject({ status: 'received' });
    expect(saved?.payload.answers).toMatchObject({
      roof: 'tin',
      floors: '2',
      shade: 'none',
      size: 'unknown',
      consumer: 'MH123456789',
    });
  });
});
