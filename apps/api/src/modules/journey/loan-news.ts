import { customers, type DatabaseExecutor, projectLoans, projects } from '@oneohm/database';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { templateOn } from '../send-to-customer/send-deliver';
import { SEND_WORDS } from '../send-to-customer/send-words';
import { answererName, ensureChatOwner, tellChatTeam } from '../whatsapp/chat-owner';
import { conversationForPhone } from '../whatsapp/chat-store';
import { send } from './auto-messages';
import { taskByKey } from './journey-store';
import { STEP_WORDS } from './step-words';

export type LoanNews = 'sanctioned' | 'disbursed' | 'rejected';

/**
 * The bank's decision reaches the customer (redesign §4 Loan): sanctioned, money sent, or not approved
 * (a person is also asked to call them). Only when the loan step's template lets the customer hear about it
 * (PRD 6.2); inside the 24-hour window the chat message, outside it the approved template (off until
 * Meta approves it). `key` makes the same news once.
 */
export async function tellLoanNews(
  tx: DatabaseExecutor,
  projectId: string,
  news: LoanNews,
  given: { readonly amountPaise: number; readonly key: string },
): Promise<void> {
  const task = await taskByKey(tx, projectId, 'loan_approval');
  if (!task?.notifyCustomer) return;
  const [row] = await tx
    .select({ name: customers.name, phone: customers.phoneE164, bank: projectLoans.lenderName })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(projectLoans, eq(projectLoans.projectId, projects.id))
    .where(eq(projects.id, projectId));
  if (!row || (news !== 'rejected' && given.amountPaise <= 0)) return;
  const bank = row.bank.trim() || 'the bank';
  const amount = formatInr(given.amountPaise);
  const chat = await conversationForPhone(tx, row.phone);
  const owned = await ensureChatOwner(tx, chat);
  const staff = (await answererName(tx, owned)) ?? SEND_WORDS.callback.team;
  const payload = { customer: titleCaseName(row.name), bank, amount, staff };
  const via = await send(
    tx,
    { phone: row.phone },
    {
      template: `loan_${news}`,
      payload,
      key: given.key,
      reply: async () => ({
        kind: 'text',
        body:
          news === 'rejected'
            ? STEP_WORDS.loan.rejected(bank, staff)
            : STEP_WORDS.loan[news](amount, bank),
      }),
    },
  );
  const told = {
    sanctioned: `the loan of ${amount} is sanctioned by ${bank}`,
    disbursed: `${amount} was sent by ${bank}`,
    rejected: `${bank} did not approve the loan`,
  }[news];
  // The log says what really happened: a template that is switched off tells nobody.
  const sent = via === 'chat' || (await templateOn(tx, `loan_${news}`));
  await logAction(
    tx,
    { projectId, leadId: null },
    {
      kind: 'customer_action',
      message: `Told the customer ${told} on WhatsApp${sent ? '' : ' (not sent: the message is switched off)'}`,
      userId: null,
      data: { news },
    },
  );
  await recordAudit(tx, null, 'customer.loan_news', 'project', projectId, { news, sent });
  if (news === 'rejected')
    await tellChatTeam(tx, owned, {
      kind: 'loan_rejected',
      title: `Call ${row.name}: ${bank} did not approve the loan`,
      body: `${row.name} was told ${staff} will call to plan the next steps.`,
      key: `${given.key}:call`,
    });
}
