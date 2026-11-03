import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { API, Session } from '../support/http';
import { milestoneOf, signedWebhook } from '../support/money';
import { replies, type SentReply } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Live QA round 2: an instalment above the UPI limit is paid in parts, each part with its
// receipt and what is left; Documents sends the PDFs themselves; templates say the
// instalment and the town instead of labels and codes.
describe('Live QA round 2', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A sold project whose customer just wrote (the chat window is open), and its pay link. */
  const soldInChat = async (name: string) => {
    const sale = await sellProject(admin, { name });
    await rows(
      `insert into wa_conversations (phone, customer_id, last_inbound_at) values ($1, $2, now())
       on conflict (phone) do update set last_inbound_at = now()`,
      [sale.customer.phone, sale.customer.customerId],
    );
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    const [sent] = await rows<{ payload: Record<string, string> }>(
      "select payload from outbox where recipient = $1 and template = 'payment_link' order by created_at desc limit 1",
      [sale.customer.phone],
    );
    return { ...sale, advance, payToken: sent?.payload.payToken ?? '', sent: sent?.payload };
  };
  const openLink = async (payToken: string) => {
    await fetch(`${API}/pay/due/${payToken}?go=1`, { redirect: 'manual' });
  };
  const linkOf = async (milestoneId: string) =>
    (
      await rows<{ provider_link_id: string; status: string }>(
        'select provider_link_id, status from payment_links where milestone_id = $1',
        [milestoneId],
      )
    )[0];
  const pay = (event: string, linkId: string, paymentId: string, amount: number) =>
    signedWebhook({
      event,
      payload: {
        payment_link: { entity: { id: linkId } },
        payment: { entity: { id: paymentId, amount, fee: 0 } },
      },
    });
  const byKey = async (key: string) =>
    (
      await rows<{ payload: SentReply & { url?: string; label?: string } }>(
        'select payload from outbox where dedupe_key = $1',
        [key],
      )
    )[0]?.payload;
  const paymentsOf = (milestoneId: string) =>
    rows<{ id: string; receipt_number: string }>(
      'select id, receipt_number from payments where milestone_id = $1 order by created_at',
      [milestoneId],
    );

  it('a part payment gets its receipt and what is left; the full one gets the next step', async () => {
    const sale = await soldInChat('Part Pay Customer (test)');
    await openLink(sale.payToken);
    const link = await linkOf(sale.advance.id);
    const part = 1_000_000;
    const stamp = Date.now();

    const first = await pay(
      'payment_link.partially_paid',
      link?.provider_link_id ?? '',
      `pay_part_${stamp}`,
      part,
    );

    expect(first.outcome).toBe('recorded');
    expect((await linkOf(sale.advance.id))?.status).toBe('partly_paid');
    const [partPaid] = await paymentsOf(sale.advance.id);
    expect(partPaid?.receipt_number).toBeTruthy();
    expect(await byKey(`receipt_pdf:${partPaid?.id}`)).toMatchObject({ kind: 'document' });
    const left = await byKey(`paid_left:${partPaid?.id}`);
    const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
    expect(left).toMatchObject({
      kind: 'cta_url',
      body: `${rupees(part)} received. ${rupees(sale.advance.amountPaise - part)} is left on this instalment.`,
      label: 'Pay now',
    });
    expect(left?.url).toContain('/v1/pay/due/');
    expect(await byKey(`paid_next:${partPaid?.id}`)).toBeUndefined();

    const rest = sale.advance.amountPaise - part;
    const second = await pay(
      'payment_link.paid',
      link?.provider_link_id ?? '',
      `pay_rest_${stamp}`,
      rest,
    );

    expect(second.outcome).toBe('recorded');
    expect((await linkOf(sale.advance.id))?.status).toBe('paid');
    const [, full] = await paymentsOf(sale.advance.id);
    expect(await byKey(`paid_left:${full?.id}`)).toBeUndefined();
    const next = await byKey(`paid_next:${full?.id}`);
    expect(next?.buttons?.[0]?.id).toBe(`paper:receipt:${full?.id}`);
  });

  it('Documents lists the papers, and a tap sends that PDF itself', async () => {
    const sale = await soldInChat('Paper List Customer (test)');
    await openLink(sale.payToken);
    await fetch(`${API}/pay/sandbox/${(await linkOf(sale.advance.id))?.provider_link_id}`, {
      method: 'POST',
    });
    const [payment] = await paymentsOf(sale.advance.id);

    await sendInbound(sale.customer.phone, { text: 'documents' });

    const list = (await replies(sale.customer.phone)).at(-1);
    expect(list?.kind).toBe('list');
    const titles = list?.rows?.map((row) => row.title) ?? [];
    expect(titles).toContain('Your quotation');
    expect(titles).toContain('Receipt · 1st instalment');
    expect(titles.at(-1)).toBe('Back to menu');
    expect(list?.rows?.length).toBeLessThanOrEqual(10);
    for (const title of titles) {
      expect(title.length).toBeLessThanOrEqual(24);
      expect(title).not.toMatch(/OH[-/]/);
    }

    await sendInbound(sale.customer.phone, { listReply: `paper:receipt:${payment?.id}` });

    const [file, taps] = (await replies(sale.customer.phone)).slice(-2);
    expect(file).toMatchObject({
      kind: 'document',
      filename: 'OneOhm-Paper-List-Customer-test-receipt.pdf',
      caption: `Your payment receipt (${payment?.receipt_number})`,
    });
    expect((await fetch(file?.link ?? '')).headers.get('content-type')).toContain(
      'application/pdf',
    );
    expect(taps?.buttons?.map((button) => button.id)).toEqual(['menu', 'human']);
    // A paper tap is the bot's own: it never counts as the customer waiting for staff.
    const [logged] = await rows<{ mine: boolean }>(
      `select m.assistant_tap as mine from wa_messages m join wa_conversations c on c.id = m.conversation_id
        where c.phone = $1 and m.direction = 'in' order by m.created_at desc limit 1`,
      [sale.customer.phone],
    );
    expect(logged?.mine).toBe(true);
  });

  it('templates say the instalment and the town and size, not the label and code', async () => {
    const sale = await soldInChat('Plain Template Customer (test)');
    const [site] = await rows<{ city: string; wp: number }>(
      'select pr.city, p.capacity_wp as wp from projects p join properties pr on pr.id = p.property_id where p.id = $1',
      [sale.project.id],
    );

    expect(sale.sent?.milestone).toBe('1st instalment (25%)');
    expect(sale.sent?.instalment).toBe('0/3/25');
    expect(sale.sent?.project).toBe(
      `${site?.city} · ${Number(((site?.wp ?? 0) / 1000).toFixed(2))} kW`,
    );
    expect(sale.sent?.project).not.toBe(sale.project.code);
  });

  it('the pay page says how to pay above the UPI limit, and only then', async () => {
    const sale = await soldInChat('Upi Limit Customer (test)');
    const page = async () => (await fetch(`${API}/pay/due/${sale.payToken}`)).text();
    const line = 'UPI takes up to ₹1,00,000 at a time';

    expect(await page()).not.toContain(line);
    await rows('update payment_milestones set amount_paise = 11958000 where id = $1', [
      sale.advance.id,
    ]);
    const large = await page();

    expect(large).toContain('₹1,19,580');
    expect(large).toContain(
      `${line}: pay ₹1,00,000 now, then open this same link again for the rest.`,
    );
  });
});
