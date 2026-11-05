import { askKeyOf } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { upload } from '../support/files';
import { Session } from '../support/http';
import {
  saveLoan,
  setNotify,
  setTemplate,
  stepAsks,
  taskIdOf,
  taskRow,
} from '../support/journey-steps';
import { addDays, sellProject, today } from '../support/sales';
import { openChat, sendTo } from '../support/send';

// Fixes from the phase 4b review: a cancel never flips an answer that committed first; loan papers asked
// before the wait still end it; another lead's or home's asks survive; an expired bank day keeps the
// customer's answer; the loan news is not "sent" to someone who said STOP.

describe('Phase 4b fixes: loan', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('loan papers asked before the step waits on the customer end that wait when checked', async () => {
    const sale = await sellProject(admin, { name: 'Loan Ask First (test)', loan: true });
    const { customer } = sale;
    await saveLoan(admin, sale);
    const stepId = await taskIdOf(sale, 'loan_documents');
    const title = 'Sanction letter (test)';
    const ask = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'bank_loan',
      title,
      requirementKey: askKeyOf({ category: 'bank_loan', title }),
    });
    await admin.post(`/tasks/${stepId}/waiting`, { party: 'customer', note: 'Loan papers (test)' });
    const [stamped] = await rows<{ since: string | null }>(
      "SELECT payload->>'waitSince' AS since FROM customer_actions WHERE id = $1",
      [ask.id],
    );
    expect(stamped?.since).not.toBeNull();
    await upload(admin, 'document', {
      projectId: sale.project.id,
      category: 'bank_loan',
      name: title,
    });
    expect((await taskRow(stepId))?.status).not.toBe('waiting');
    expect(customer.customerId).toBeDefined();
  });

  it('a paper asked during a wait on the bank belongs to no customer wait started later', async () => {
    const sale = await sellProject(admin, { name: 'Loan Other Wait (test)', loan: true });
    await saveLoan(admin, sale);
    const stepId = await taskIdOf(sale, 'loan_documents');
    await admin.post(`/tasks/${stepId}/waiting`, { party: 'bank', note: 'Bank (test)' });
    const title = 'Loan agreement (test)';
    const ask = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'bank_loan',
      title,
      requirementKey: askKeyOf({ category: 'bank_loan', title }),
    });
    await admin.post(`/tasks/${stepId}/waiting`, { party: 'customer', note: 'Site key (test)' });
    const [after] = await rows<{ since: string | null }>(
      "SELECT payload->>'waitSince' AS since FROM customer_actions WHERE id = $1",
      [ask.id],
    );
    expect(after?.since).toBeNull();
    await upload(admin, 'document', {
      projectId: sale.project.id,
      category: 'bank_loan',
      name: title,
    });
    expect((await taskRow(stepId))?.status).toBe('waiting');
  });

  it('an expired bank day keeps the answer the customer gave and says it expired', async () => {
    const sale = await sellProject(admin, { name: 'Bank Expired Answer (test)', loan: true });
    const { customer, project } = sale;
    await saveLoan(admin, sale);
    await openChat(customer.phone, customer.customerId);
    const day = addDays(today(), 2);
    await sendTo(
      admin,
      { projectId: project.id },
      { action: 'ask_bank_sign', projectId: project.id, branch: 'Main branch', day },
    );
    const [ask] = await stepAsks(customer.customerId, 'bank_sign');
    // An answer already on an ask that is still open (an older or hand-made row) is kept.
    await rows(
      `UPDATE customer_actions SET payload = jsonb_set(payload, '{answer}', '"change"') WHERE id = $1`,
      [ask?.id],
    );
    const dayAfter = new Date(`${addDays(day, 1)}T06:30:00Z`);
    await queueActionReminders(acceptanceDb().db, dayAfter, 'Asia/Kolkata');
    const [done] = await stepAsks(customer.customerId, 'bank_sign');
    expect(done).toMatchObject({
      status: 'cancelled',
      payload: expect.objectContaining({ answer: 'change', expired: true }),
    });
    const logs = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE '%was not confirmed, so the ask closed%'",
      [project.id],
    );
    expect(logs).toHaveLength(1);
  });

  it('loan news after STOP is logged as an SMS, not as WhatsApp', async () => {
    const sale = await sellProject(admin, { name: 'Loan News Stop (test)', loan: true });
    const { customer, project } = sale;
    await saveLoan(admin, sale);
    await setNotify(sale, 'loan_approval', true);
    await rows('UPDATE customers SET whatsapp_opt_in = false WHERE id = $1', [customer.customerId]);
    // The SMS goes only while the owner has the message on (Settings -> WhatsApp messages).
    const back = await setTemplate('loan_rejected', true);
    await saveLoan(admin, sale, { status: 'rejected' });
    await back();
    const [line] = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE project_id = $1 AND message LIKE 'Told the customer%did not approve%'",
      [project.id],
    );
    expect(line?.message).toContain('by SMS (they said STOP on WhatsApp)');
    // Money and loan news still go by SMS after STOP (owner's rule); never as a WhatsApp template.
    const queued = (await outboxFor(customer.phone)).filter(
      (row) => row.template === 'loan_rejected',
    );
    expect(queued.map((row) => row.channel)).toEqual(['sms']);
  });
});
