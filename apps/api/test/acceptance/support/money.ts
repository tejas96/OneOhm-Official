import { createHmac, randomUUID } from 'node:crypto';
import type { ProjectDetail, TrialBalance } from '@oneohm/api-contracts';
import { expect } from 'vitest';
import { rows } from './db';
import { API, type Session } from './http';
import { today } from './sales';

/** The secret the runner gives the acceptance API, so the suite can sign like Razorpay. */
export const WEBHOOK_SECRET = 'oneohm-acceptance-webhook-secret';

type Milestone = ProjectDetail['milestones'][number];
export type Trigger =
  | 'quotation_accepted'
  | 'material_dispatch'
  | 'commissioning_completed'
  | 'loan_disbursement';

/** The project's milestone made due by this business event. */
export function milestoneOf(detail: ProjectDetail, trigger: Trigger): Milestone {
  const found = detail.milestones.find((milestone) => milestone.trigger === trigger);
  if (!found) throw new Error(`${detail.code} has no ${trigger} milestone.`);
  return found;
}

export const owed = (milestone: Milestone) => milestone.amountPaise - milestone.paidPaise;

/** Records money received against a milestone (cash, cheque, UPI, bank transfer). */
export function recordPayment(
  who: Session,
  projectId: string,
  milestone: Milestone,
  method: 'cash' | 'cheque' | 'bank_transfer' | 'upi',
  extra: Record<string, unknown> = {},
): Promise<ProjectDetail> {
  return who.post<ProjectDetail>(`/projects/${projectId}/payments`, {
    milestoneId: milestone.id,
    amountPaise: owed(milestone),
    method,
    receivedOn: today(),
    reference: `${method.toUpperCase()}-${randomUUID().slice(0, 8)} (test)`,
    ...extra,
  });
}

/** A gateway webhook signed with the shared secret (HMAC SHA-256 of the raw body, hex). */
export async function signedWebhook(
  body: Record<string, unknown>,
  secret = WEBHOOK_SECRET,
): Promise<{ status: number; outcome: string }> {
  const raw = JSON.stringify(body);
  const res = await fetch(`${API}/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', secret).update(raw).digest('hex'),
      'x-razorpay-event-id': `evt_acceptance_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    },
    body: raw,
  });
  const text = await res.text();
  const outcome = text.startsWith('{') ? (JSON.parse(text) as { outcome?: string }).outcome : '';
  return { status: res.status, outcome: outcome ?? text };
}

/** How many ledger entries one business event posted (each event books once). */
export async function postings(sourceType: string, sourceId: string): Promise<number> {
  const [row] = await rows<{ count: string }>(
    'select count(*) from journal_entries where source_type = $1 and source_id = $2',
    [sourceType, sourceId],
  );
  return Number(row?.count ?? 0);
}

/** How many "money paid out" entries a bill has: one per payment that stands or was made. */
export async function billPostings(billId: string): Promise<number> {
  const [row] = await rows<{ count: string }>(
    `select count(*) from journal_entries e
      where (e.source_type = 'payable_payment'
             and e.source_id in (select id::text from payable_payments where payable_id = $1))
         or (e.source_type = 'payable_paid' and e.source_id = $1::text)`,
    [billId],
  );
  return Number(row?.count ?? 0);
}

/** Debits less credits on the payable account of one bill's payment entries, in paise. */
export async function billPaidOut(billId: string): Promise<number> {
  const [row] = await rows<{ paid: string }>(
    // The bill's payment entries, plus any entry that reverses one of them (undo, bank return).
    `with paid as (
       select e.id from journal_entries e
        where (e.source_type = 'payable_payment'
               and e.source_id in (select id::text from payable_payments where payable_id = $1))
           or (e.source_type = 'payable_paid' and e.source_id = $1::text)
     )
     select coalesce(sum(l.debit_paise - l.credit_paise), 0) as paid
       from journal_entries e join journal_lines l on l.entry_id = e.id
      where l.account_code in ('2000', '2010', '2030')
        and (e.id in (select id from paid)
          or (e.source_type = 'reversal' and e.source_id in (select id::text from paid)))`,
    [billId],
  );
  return Number(row?.paid ?? 0);
}

/** The trial balance must always balance: every posting has equal debits and credits. */
export async function expectBalanced(who: Session): Promise<TrialBalance> {
  const balance = await who.get<TrialBalance>('/finance/trial-balance');
  if (!balance.balanced || balance.totalDebitPaise !== balance.totalCreditPaise) {
    throw new Error(
      `Trial balance out: debits ${balance.totalDebitPaise}, credits ${balance.totalCreditPaise}.`,
    );
  }
  return balance;
}

/** The gateway's own id for a link or payout, as Razorpay would send it back. */
export async function providerId(table: 'payment_links' | 'bank_payouts', id: string) {
  const column = table === 'payment_links' ? 'provider_link_id' : 'provider_payout_id';
  const [row] = await rows<{ ref: string }>(`select ${column} as ref from ${table} where id = $1`, [
    id,
  ]);
  return row?.ref ?? '';
}

/**
 * After a payment (live review C6, C16): the receipt is named for the customer, and the
 * chat says in Marathi what happens next and who to call (the project manager, else the
 * lead owner, whoever has a phone), ending with taps.
 */
export async function expectPaidNews(receiptFile: string, paymentId: string, projectId: string) {
  expect(receiptFile).toBe('OneOhm-Ravi-Patil-test-receipt.pdf');
  const [next] = await rows<{ payload: { body: string; buttons: { id: string }[] } }>(
    'SELECT payload FROM outbox WHERE dedupe_key = $1',
    [`paid_next:${paymentId}`],
  );
  const [contact] = await rows<{ name: string; phone: string }>(
    `SELECT u.full_name AS name, u.phone_e164 AS phone FROM projects p
       JOIN quotations q ON q.id = p.quotation_id LEFT JOIN leads l ON l.id = q.lead_id
       JOIN users u ON u.id IN (p.manager_user_id, l.owner_user_id)
      WHERE p.id = $1 AND u.phone_e164 IS NOT NULL
      ORDER BY (u.id = p.manager_user_id) DESC LIMIT 1`,
    [projectId],
  );
  expect(contact?.phone).toBeTruthy();
  expect(next?.payload.body).toBe(
    `धन्यवाद, तुमचे पेमेंट मिळाले. पुढे: सिस्टमच्या नियोजनासाठी साइट भेट. तुमचा संपर्क: ${contact?.name}, ${contact?.phone}.`,
  );
  // View receipt sends this receipt's PDF (live QA round 2).
  expect(next?.payload.buttons.map((button) => button.id)).toEqual([
    `paper:receipt:${paymentId}`,
    'go:update',
    'menu',
  ]);
}

/** The [Pay ₹X] button's id on the newest buttons message to this phone (redesign §10). */
export async function payTapOf(phone: string): Promise<string> {
  const sent = await rows<{ payload: { buttons: { id: string }[] } }>(
    `SELECT payload FROM outbox WHERE recipient = $1 AND template = 'session:buttons'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [phone],
  );
  return sent[0]?.payload.buttons.find((button) => button.id.startsWith('pay:'))?.id ?? '';
}

/**
 * What one RazorpayX payout fee left in the books, net of any refund: bank charge (5020),
 * GST input credit (1310) and bank (1000), as debits less credits in paise.
 */
export async function feeBooks(payoutId: string) {
  const found = await rows<{ account: string; net: string }>(
    `select l.account_code as account, sum(l.debit_paise - l.credit_paise) as net
       from journal_entries e join journal_lines l on l.entry_id = e.id
      where e.source_type in ('payout_fee', 'payout_fee_refund')
        and (e.source_id = $1 or e.source_id = $1 || ':again')
      group by l.account_code`,
    [payoutId],
  );
  const net = (code: string) => Number(found.find((row) => row.account === code)?.net ?? 0);
  return { expense: net('5020'), gstInput: net('1310'), bank: net('1000') };
}
