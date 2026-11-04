import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SAMPLE_CDN_PREFIX,
  SAMPLE_CDN_TAMPERED,
  sampleCdnFile,
} from '../../../src/modules/whatsapp/forms/sample-cdn';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { askAboutFiles, docsOf } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// The "Send a paper" form (redesign 5.5, phase 2b): [Send it now] opens a WhatsApp form when it
// is published; its files answer that paper directly. No flow id: the chat asks for the photo.

const FLOW_ID = '990011223344';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface FlowReply {
  kind: string;
  body: string;
  button: string;
  flowId: string;
  token: string;
  screen: string;
  data: Record<string, string>;
}

const flowOf = async (phone: string) => {
  const flow = (await replies(phone)).filter((reply) => reply.kind === 'flow').at(-1);
  return flow as unknown as FlowReply | undefined;
};

let counter = 0;
const photo = (name = 'bill') => {
  counter += 1;
  return {
    id: `form-media-${Date.now()}-${counter}`,
    file_name: `${name}.jpg`,
    mime_type: 'image/jpeg',
    sha256: 'x',
  };
};

const actionOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

describe('Forms: Send a paper', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
    await rows(
      `INSERT INTO wa_forms (key, flow_id) VALUES ('send_paper', $1)
       ON CONFLICT (key) DO UPDATE SET flow_id = EXCLUDED.flow_id`,
      [FLOW_ID],
    );
  });
  afterAll(async () => {
    await rows("DELETE FROM wa_forms WHERE key = 'send_paper'");
    await closeDb();
  });

  const asked = async (name: string) => {
    const { customer, project } = await sellProject(admin, { name });
    const ask = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
      requirementKey: 'bill',
    });
    return { customer, project, ask };
  };

  it('[Send it now] sends the form with the paper and home, and the fallback line', async () => {
    const { customer, ask } = await asked('Form Open (test)');
    await tap(customer.phone, `sendit:${ask.id}`);
    const flow = await flowOf(customer.phone);
    expect(flow).toMatchObject({ flowId: FLOW_ID, screen: 'SEND_PAPER', button: 'Send paper' });
    expect(flow?.data.heading).toMatch(/^Electricity bill \(test\) — .+$/);
    expect(flow?.body).toContain('Or just send the photo here.');
    expect(flow?.body).toContain('*Electricity bill (test)*');
    const [token] = await rows<{ payload: { actionId: string }; form_key: string }>(
      'SELECT payload, form_key FROM wa_flow_tokens WHERE token = $1',
      [flow?.token],
    );
    expect(token).toMatchObject({ form_key: 'send_paper', payload: { actionId: ask.id } });
  });

  it('the form words follow the customer language', async () => {
    const { customer, ask } = await asked('Form Marathi (test)');
    await tap(customer.phone, 'lang:mr');
    await tap(customer.phone, `sendit:${ask.id}`);
    const flow = await flowOf(customer.phone);
    expect(flow?.button).toBe('कागद पाठवा');
    expect(flow?.data.send).toBe('पाठवा');
    expect(flow?.body).toContain('किंवा फोटो इथेच पाठवा.');
  });

  it('two photos from the form answer the paper, front and back, and say Saved', async () => {
    const { customer, project, ask } = await asked('Form Reply (test)');
    await tap(customer.phone, `sendit:${ask.id}`);
    const flow = await flowOf(customer.phone);
    await sendInbound(customer.phone, {
      form: { token: flow?.token ?? '', files: [photo('front'), photo('back')] },
    });
    const docs = await docsOf(customer.customerId);
    expect(docs).toHaveLength(2);
    for (const doc of docs)
      expect(doc).toMatchObject({ category: 'electricity_bill', project_id: project.id });
    expect((await actionOf(ask.id))?.status).toBe('received');
    const saved = await lastReply(customer.phone);
    expect(saved?.body).toMatch(
      /^Saved ✅ 2 files as \*Electricity bill \(test\)\* · .+\. We'll check them\.$/,
    );
    expect(saved?.buttons?.map((button) => button.title)).toEqual(['Change', 'Menu']);
    // The customer chose the paper: no "What is this?" afterwards.
    await askAboutFiles(admin);
    const asking = (await replies(customer.phone)).filter((reply) =>
      /What is this|Is this your|Got your/.test(reply.body),
    );
    expect(asking).toHaveLength(0);
  });

  it('encrypted files from the CDN are decrypted and kept', async () => {
    const { customer, ask } = await asked('Form Encrypted (test)');
    await tap(customer.phone, `sendit:${ask.id}`);
    const flow = await flowOf(customer.phone);
    const { meta } = sampleCdnFile(PNG);
    const file = {
      media_id: `cdn-${Date.now()}`,
      cdn_url: `${SAMPLE_CDN_PREFIX}ok`,
      file_name: 'bill.png',
      encryption_metadata: meta,
    };
    await sendInbound(customer.phone, { form: { token: flow?.token ?? '', files: [file] } });
    expect((await docsOf(customer.customerId)).length).toBe(1);
    expect((await actionOf(ask.id))?.status).toBe('received');
  });

  it('a tampered file is refused with the true error, the team is alerted, nothing is filed', async () => {
    const { customer, ask } = await asked('Form Tampered (test)');
    await tap(customer.phone, `sendit:${ask.id}`);
    const flow = await flowOf(customer.phone);
    const { meta } = sampleCdnFile(PNG);
    const file = {
      media_id: `bad-${Date.now()}`,
      cdn_url: SAMPLE_CDN_TAMPERED,
      file_name: 'bill.png',
      encryption_metadata: meta,
    };
    await sendInbound(customer.phone, { form: { token: flow?.token ?? '', files: [file] } });
    expect(await docsOf(customer.customerId)).toHaveLength(0);
    expect((await actionOf(ask.id))?.status).toBe('open');
    expect((await lastReply(customer.phone))?.body).toBe(
      'Sorry, we could not open that file. Please send it again in a little while.',
    );
    const chat = await chatOf(customer.phone);
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE dedupe_key LIKE '%wa_form_lost:' || $1 || ':%'",
      [chat.id],
    );
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('a form that was answered already, or has expired, is "old" and Home follows', async () => {
    const { customer, ask } = await asked('Form Old (test)');
    await tap(customer.phone, `sendit:${ask.id}`);
    const first = await flowOf(customer.phone);
    await sendInbound(customer.phone, { form: { token: first?.token ?? '', files: [photo()] } });
    // The same token again: used.
    await sendInbound(customer.phone, { form: { token: first?.token ?? '', files: [photo()] } });
    const all = await replies(customer.phone);
    expect(all.some((reply) => reply.body === 'That form is old — please try again.')).toBe(true);
    expect(await docsOf(customer.customerId)).toHaveLength(1);
    // An expired one.
    const other = await asked('Form Expired (test)');
    await tap(other.customer.phone, `sendit:${other.ask.id}`);
    const flow = await flowOf(other.customer.phone);
    await rows(
      "UPDATE wa_flow_tokens SET expires_at = now() - interval '1 minute' WHERE token = $1",
      [flow?.token],
    );
    await sendInbound(other.customer.phone, {
      form: { token: flow?.token ?? '', files: [photo()] },
    });
    const body = (await replies(other.customer.phone)).map((reply) => reply.body);
    expect(body).toContain('That form is old — please try again.');
    expect(await docsOf(other.customer.customerId)).toHaveLength(0);
    // An unknown token too.
    await sendInbound(other.customer.phone, { form: { token: 'not-ours', files: [photo()] } });
    expect(body.filter((line) => line === 'That form is old — please try again.')).toHaveLength(1);
    expect(
      (await replies(other.customer.phone)).filter(
        (r) => r.body === 'That form is old — please try again.',
      ),
    ).toHaveLength(2);
  });

  it('without a published form the chat asks for the photo instead', async () => {
    const { customer, ask } = await asked('Form Missing (test)');
    await rows("DELETE FROM wa_forms WHERE key = 'send_paper'");
    try {
      await tap(customer.phone, `sendit:${ask.id}`);
    } finally {
      await rows(
        "INSERT INTO wa_forms (key, flow_id) VALUES ('send_paper', $1) ON CONFLICT (key) DO NOTHING",
        [FLOW_ID],
      );
    }
    const reply = await lastReply(customer.phone);
    expect(reply?.kind).toBe('buttons');
    expect(reply?.body).toMatch(
      /^Please send your \*Electricity bill \(test\)\* .* here as a photo or PDF\.$/,
    );
    expect(await flowOf(customer.phone)).toBeUndefined();
  });

  it('More → Send a paper opens the form for the one paper asked', async () => {
    const { customer } = await asked('Form More (test)');
    await tap(customer.phone, 'go:paper');
    const flow = await flowOf(customer.phone);
    expect(flow?.data.heading).toMatch(/^Electricity bill \(test\)/);
  });

  it('a form for a paper answered meanwhile is not guessed: the files wait and are asked about', async () => {
    const { customer, ask } = await asked('Form Gone (test)');
    await tap(customer.phone, `sendit:${ask.id}`);
    const flow = await flowOf(customer.phone);
    await rows("UPDATE customer_actions SET status = 'received' WHERE id = $1", [ask.id]);
    await sendInbound(customer.phone, { form: { token: flow?.token ?? '', files: [photo()] } });
    expect((await lastReply(customer.phone))?.kind).toBe('flow');
    await askAboutFiles(admin);
    const question = await lastReply(customer.phone);
    expect(question?.body).toMatch(/What is this|Got your|Is this/);
  });
});
