import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import {
  actionOf,
  askedBill,
  bodies,
  FLOW_ID,
  OLD,
  openedForm,
  photo,
  SAMPLE_PNG_SHA,
  setFlow,
} from '../support/forms';
import { Session } from '../support/http';
import { chatOf, lastReply, tap } from '../support/onboarding';
import { askAboutFiles, docsOf } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// The "Send a paper" form (redesign 5.5, phase 2b): [Send it now] opens a WhatsApp form when it
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

  it('[Send it now] sends the form with the paper and home, the fallback line and the fallback text', async () => {
    const { customer, ask } = await asked('Form Open (test)');
    const flow = await opened(customer.phone, ask.id);
    expect(flow).toMatchObject({ flowId: FLOW_ID, screen: 'SEND_PAPER', button: 'Send paper' });
    expect(flow.data.heading).toMatch(/^Electricity bill \(test\) — .+$/);
    expect(flow.data.pdf_link).toBe('Have a PDF instead?');
    expect(flow.body).toContain('Or just send the photo here.');
    expect(flow.body).toContain('*Electricity bill (test)*');
    // If WhatsApp cannot deliver the form, the worker sends these words instead.
    expect(flow.fallbackText).toMatch(
      /^Please send your \*Electricity bill \(test\)\* .* here as a photo or PDF\.$/,
    );
    const [token] = await rows<{ payload: { actionId: string }; form_key: string }>(
      'SELECT payload, form_key FROM wa_flow_tokens WHERE token = $1',
      [flow.token],
    );
    expect(token).toMatchObject({ form_key: 'send_paper', payload: { actionId: ask.id } });
  });

  it('the form words follow the customer language', async () => {
    const { customer, ask } = await asked('Form Marathi (test)');
    await tap(customer.phone, 'lang:mr');
    const flow = await opened(customer.phone, ask.id);
    expect(flow.button).toBe('कागद पाठवा');
    expect(flow.data.send).toBe('पाठवा');
    expect(flow.data.pdf_link).toBe('PDF आहे का?');
    expect(flow.body).toContain('किंवा फोटो इथेच पाठवा.');
  });

  it('two photos answer the paper, front and back, say Saved and are not asked about again', async () => {
    const { customer, project, ask } = await asked('Form Reply (test)');
    const flow = await opened(customer.phone, ask.id);
    await sendInbound(customer.phone, {
      form: { token: flow.token, photos: [photo('front'), photo('back')] },
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
    await askAboutFiles(admin);
    const asking = (await bodies(customer.phone)).filter((b) =>
      /What is this|Is this your|Got your/.test(b),
    );
    expect(asking).toHaveLength(0);
    // The chat shows the files, once each, and says what the message was.
    const chat = await chatOf(customer.phone);
    const shown = await rows(
      "SELECT 1 FROM wa_messages WHERE conversation_id = $1 AND direction = 'in' AND document_id IS NOT NULL",
      [chat.id],
    );
    expect(shown).toHaveLength(2);
    const [line] = await rows<{ body: string }>(
      "SELECT body FROM wa_messages WHERE conversation_id = $1 AND kind = 'form'",
      [chat.id],
    );
    expect(line?.body).toBe('Sent a form (2 files)');
  });

  it('a PDF from the second screen answers the paper', async () => {
    const { customer, ask } = await asked('Form Pdf (test)');
    const flow = await opened(customer.phone, ask.id);
    const pdf = {
      id: `form-pdf-${Date.now()}`,
      file_name: 'bill.pdf',
      mime_type: 'application/pdf',
    };
    await sendInbound(customer.phone, { form: { token: flow.token, pdfs: [pdf] } });
    const docs = await docsOf(customer.customerId);
    expect(docs).toHaveLength(1);
    expect((await actionOf(ask.id))?.status).toBe('received');
  });

  it('checks the file against the SHA-256 WhatsApp gave', async () => {
    const good = await asked('Form Hash Good (test)');
    const flowGood = await opened(good.customer.phone, good.ask.id);
    await sendInbound(good.customer.phone, {
      form: { token: flowGood.token, photos: [photo('bill', { sha256: SAMPLE_PNG_SHA })] },
    });
    expect((await actionOf(good.ask.id))?.status).toBe('received');

    const { customer, ask } = await asked('Form Hash Bad (test)');
    const flow = await opened(customer.phone, ask.id);
    const wrong = createHash('sha256').update('other bytes').digest('base64');
    await sendInbound(customer.phone, {
      form: { token: flow.token, photos: [photo('bill', { sha256: wrong })] },
    });
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

  it('one good and one bad file in one reply: the good one is saved, the bad one is told once', async () => {
    const { customer, ask } = await asked('Form Mixed (test)');
    const flow = await opened(customer.phone, ask.id);
    const bad = { id: 'sample-wrong-type', file_name: 'notes.pdf', mime_type: 'application/pdf' };
    await sendInbound(customer.phone, { form: { token: flow.token, photos: [photo(), bad] } });
    expect(await docsOf(customer.customerId)).toHaveLength(1);
    expect((await actionOf(ask.id))?.status).toBe('received');
    const said = await bodies(customer.phone);
    expect(said.filter((line) => line.startsWith("We can't open this kind of file"))).toHaveLength(
      1,
    );
    expect(said.some((line) => line.startsWith('Saved ✅'))).toBe(true);
  });

  it('a valid form with no readable file is not "old": the customer is asked for the photo', async () => {
    const { customer, ask } = await asked('Form Empty (test)');
    const flow = await opened(customer.phone, ask.id);
    await sendInbound(customer.phone, { form: { token: flow.token, photos: [] } });
    const said = await bodies(customer.phone);
    expect(said.at(-1)).toBe("We didn't get the file — please send the photo here.");
    expect(said).not.toContain(OLD);
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE dedupe_key LIKE '%wa_form_empty:%' AND body LIKE $1",
      [`%${customer.phone.slice(-4)}%`],
    );
    expect(alerts.length).toBeGreaterThan(0);
  });
});
