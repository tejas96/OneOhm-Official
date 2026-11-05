import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import {
  actionOf,
  askedBill,
  bodies,
  FLOW_ID,
  flowOf,
  OLD,
  openedForm,
  photo,
  setFlow,
} from '../support/forms';
import { Session } from '../support/http';
import { chatOf, lastReply, replies, tap } from '../support/onboarding';
import { askAboutFiles, docsOf } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// The "Send a paper" form guards (redesign 5.5, phase 2b): [Send it now] opens a WhatsApp form when it
// is published; its files answer that paper directly. No flow id: the chat asks for the photo.

describe('Forms: Send a paper', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
    await setFlow(FLOW_ID);
  });
  afterAll(async () => {
    await setFlow(null);
    await closeDb();
  });

  const asked = (name: string) => askedBill(admin, name);
  const opened = openedForm;

  it('a used, expired or unknown token is "old" and Home follows', async () => {
    const { customer, ask } = await asked('Form Old (test)');
    const first = await opened(customer.phone, ask.id);
    await sendInbound(customer.phone, { form: { token: first.token, photos: [photo()] } });
    const before = (await bodies(customer.phone)).filter((line) => line === OLD).length;
    expect(before).toBe(0);
    await sendInbound(customer.phone, { form: { token: first.token, photos: [photo()] } });
    expect((await bodies(customer.phone)).filter((line) => line === OLD)).toHaveLength(1);
    expect(await docsOf(customer.customerId)).toHaveLength(1);
    // Home follows the notice.
    expect(['buttons', 'list']).toContain((await lastReply(customer.phone))?.kind);

    const other = await asked('Form Expired (test)');
    const flow = await opened(other.customer.phone, other.ask.id);
    await rows(
      "UPDATE wa_flow_tokens SET expires_at = now() - interval '1 minute' WHERE token = $1",
      [flow.token],
    );
    await sendInbound(other.customer.phone, { form: { token: flow.token, photos: [photo()] } });
    await sendInbound(other.customer.phone, { form: { token: 'not-ours', photos: [photo()] } });
    expect((await bodies(other.customer.phone)).filter((line) => line === OLD)).toHaveLength(2);
    expect(await docsOf(other.customer.customerId)).toHaveLength(0);
  });

  it('a valid token from another phone is refused and still works for its owner', async () => {
    const one = await asked('Form Owner (test)');
    const two = await asked('Form Other (test)');
    const flow = await opened(one.customer.phone, one.ask.id);
    await sendInbound(two.customer.phone, { form: { token: flow.token, photos: [photo()] } });
    expect(await bodies(two.customer.phone)).toContain(OLD);
    expect(await docsOf(two.customer.customerId)).toHaveLength(0);
    await sendInbound(one.customer.phone, { form: { token: flow.token, photos: [photo()] } });
    expect((await actionOf(one.ask.id))?.status).toBe('received');
  });

  it('two replies with one token at the same moment: only one is taken', async () => {
    const { customer, ask } = await asked('Form Race (test)');
    const flow = await opened(customer.phone, ask.id);
    await Promise.allSettled([
      sendInbound(customer.phone, { form: { token: flow.token, photos: [photo()] } }),
      sendInbound(customer.phone, { form: { token: flow.token, photos: [photo()] } }),
    ]);
    expect(await docsOf(customer.customerId)).toHaveLength(1);
    expect((await bodies(customer.phone)).filter((line) => line === OLD)).toHaveLength(1);
  });

  it('a person who has the chat: the form still files, and an old form gets no Home', async () => {
    const { customer, ask } = await asked('Form Held (test)');
    const flow = await opened(customer.phone, ask.id);
    await rows("UPDATE wa_conversations SET state = 'human' WHERE phone = $1", [customer.phone]);
    await sendInbound(customer.phone, { form: { token: 'not-ours', photos: [photo()] } });
    const sent = await replies(customer.phone);
    expect(sent.at(-1)?.body).toBe(OLD);
    await sendInbound(customer.phone, { form: { token: flow.token, photos: [photo()] } });
    expect((await actionOf(ask.id))?.status).toBe('received');
    expect((await chatOf(customer.phone)).state).toBe('human');
  });

  it('without a published form the chat asks for the photo instead', async () => {
    const { customer, ask } = await asked('Form Missing (test)');
    await setFlow(null);
    try {
      await tap(customer.phone, `sendit:${ask.id}`);
    } finally {
      await setFlow(FLOW_ID);
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

  it('with two papers asked, "What do you want to send?" lists them and a row opens that form', async () => {
    const { customer, project, ask } = await asked('Form Choose (test)');
    const deed = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'property',
      title: 'Sale deed (test)',
      requirementKey: 'property',
    });
    await tap(customer.phone, 'go:paper');
    const list = await lastReply(customer.phone);
    expect(list?.body).toBe('What do you want to send?');
    expect(list?.rows?.map((row) => row.id)).toEqual(
      expect.arrayContaining([`form:a:${ask.id}`, `form:a:${deed.id}`]),
    );
    await tap(customer.phone, `form:a:${deed.id}`);
    const flow = await flowOf(customer.phone);
    expect(flow?.data.heading).toMatch(/^Sale deed \(test\)/);
    await sendInbound(customer.phone, { form: { token: flow?.token ?? '', photos: [photo()] } });
    expect((await actionOf(deed.id))?.status).toBe('received');
    expect((await actionOf(ask.id))?.status).toBe('open');
  });

  it('a paper answered meanwhile is not guessed: the files wait and are asked about', async () => {
    const { customer, ask } = await asked('Form Gone (test)');
    const flow = await opened(customer.phone, ask.id);
    await rows("UPDATE customer_actions SET status = 'received' WHERE id = $1", [ask.id]);
    await sendInbound(customer.phone, { form: { token: flow.token, photos: [photo()] } });
    expect((await lastReply(customer.phone))?.kind).toBe('flow');
    await askAboutFiles(admin);
    expect((await lastReply(customer.phone))?.body).toMatch(/What is this|Got your|Is this/);
  });
});
