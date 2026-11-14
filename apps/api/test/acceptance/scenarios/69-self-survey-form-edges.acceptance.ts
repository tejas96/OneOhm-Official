import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { FLOW_ID, formLinkOf, OLD, photo } from '../support/forms';
import { Session } from '../support/http';
import { chatOf, lastReply, replies } from '../support/onboarding';
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

// The survey form's guards: a token of another chat or an expired one is "old"; a photo that cannot be
// opened is told to the customer once (and the team), while the rest of the reply is still saved.

describe('Self survey form: edges', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await publishSurvey(FLOW_ID);
  });
  afterAll(async () => {
    await publishSurvey(null);
    await closeDb();
  });

  async function started(name: string) {
    const sale = await sellProject(admin, { name });
    const { ask } = await offerSurvey(admin, sale);
    const flow = await startedForm(sale.customer.phone, ask.id);
    return { sale, phone: sale.customer.phone, customerId: sale.customer.customerId, flow };
  }

  it('a token of another chat, an expired one and the same one twice change nothing', async () => {
    const one = await started('Survey Edge One (test)');
    const two = await started('Survey Edge Two (test)');
    await sendInbound(two.phone, {
      form: { token: one.flow?.token ?? '', fields: { ...ANSWERS, ...photos() } },
    });
    expect((await replies(two.phone)).some((reply) => reply.body === OLD)).toBe(true);
    expect((await surveysOf(two.customerId))[0]?.status).toBe('open');

    await rows(
      "UPDATE wa_flow_tokens SET expires_at = now() - interval '1 minute' WHERE token = $1",
      [two.flow?.token],
    );
    await sendInbound(two.phone, {
      form: { token: two.flow?.token ?? '', fields: { ...ANSWERS, ...photos() } },
    });
    expect((await surveysOf(two.customerId))[0]?.status).toBe('open');

    const fields = { ...ANSWERS, consumer: '1234 5678 90', ...photos() };
    await sendInbound(one.phone, { form: { token: one.flow?.token ?? '', fields } });
    expect((await surveysOf(one.customerId))[0]?.status).toBe('received');
    expect(await formLinkOf(one.phone)).toEqual({ kind: 'project', id: one.sale.project.id });
    await sendInbound(one.phone, { form: { token: one.flow?.token ?? '', fields } });
    expect(await surveysOf(one.customerId)).toHaveLength(1);
  });

  it('a photo that fails to open: the team is alerted, the customer is asked in the chat for that photo only', async () => {
    const { phone, customerId, flow } = await started('Survey Edge Bad Photo (test)');
    const bad = { id: 'sample-wrong-type', file_name: 'meter.pdf', mime_type: 'application/pdf' };
    await sendInbound(phone, {
      form: {
        token: flow?.token ?? '',
        fields: {
          ...ANSWERS,
          consumer: '1234 5678 90',
          ...photos(),
          meter: [bad],
          corner_a: [photo()],
        },
      },
    });
    const said = (await replies(phone)).map((reply) => reply.body);
    expect(
      said.some((line) => line.includes("can't open this kind of file") || line.includes('photo')),
    ).toBe(true);
    expect((await surveysOf(customerId))[0]?.status).toBe('open');
    expect((await lastReply(phone))?.body).toContain('electricity meter');
    const chat = await chatOf(phone);
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE dedupe_key LIKE '%wa_form_lost:' || $1 || ':%'",
      [chat.id],
    );
    expect(alerts.length).toBeGreaterThan(0);
  });
});
