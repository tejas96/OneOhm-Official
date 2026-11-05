import { askKeyOf } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { upload } from '../support/files';
import { Session } from '../support/http';
import { saveLoan, taskIdOf, taskRow } from '../support/journey-steps';
import { say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat } from '../support/send';
import { askAboutFiles } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Loan papers (redesign §4 Loan, §18 11): one paper action per item of the lender's list; when the
// last is checked, the "Collect loan documents" step stops waiting on the customer.

const ITEMS = ['Sanction letter (test)', 'Loan agreement (test)'];

describe('Journey: loan papers', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** The loan desk's sheet asks each item in turn, as the web does. */
  const askAll = async (projectId: string) => {
    for (const title of ITEMS)
      await admin.post('/document-requests', {
        projectId,
        category: 'bank_loan',
        title,
        requirementKey: askKeyOf({ category: 'bank_loan', title }),
      });
  };

  const asked = (customerId: string) =>
    rows<{ id: string; status: string; title: string }>(
      `SELECT id, status::text AS status, title FROM customer_actions
        WHERE customer_id = $1 AND type = 'paper' AND category = 'bank_loan' ORDER BY created_at`,
      [customerId],
    );

  it('asks each item as its own paper; the step keeps waiting until the last is in', async () => {
    const sale = await sellProject(admin, { name: 'Loan Papers (test)', loan: true });
    const { customer } = sale;
    await saveLoan(admin, sale, { documents: ITEMS.map((name) => ({ name, received: false })) });
    await openChat(customer.phone, customer.customerId);
    const stepId = await taskIdOf(sale, 'loan_documents');
    await admin.post(`/tasks/${stepId}/waiting`, { party: 'customer', note: 'Loan papers (test)' });

    await askAll(sale.project.id);
    expect((await asked(customer.customerId)).map((one) => [one.title, one.status])).toEqual(
      ITEMS.map((title) => [title, 'open']),
    );
    // The same item is not asked twice.
    const again = await admin.raw('POST', '/document-requests', {
      projectId: sale.project.id,
      category: 'bank_loan',
      title: ITEMS[0],
      requirementKey: askKeyOf({ category: 'bank_loan', title: ITEMS[0] ?? '' }),
    });
    expect(again.status).toBe(409);

    // The first paper is in: the step still waits for the other one.
    await upload(admin, 'document', {
      projectId: sale.project.id,
      category: 'bank_loan',
      name: 'Sanction letter (test)',
    });
    expect((await asked(customer.customerId)).map((one) => one.status)).toEqual(['closed', 'open']);
    expect((await taskRow(stepId))?.status).toBe('waiting');
    await upload(admin, 'document', {
      projectId: sale.project.id,
      category: 'bank_loan',
      name: 'Loan agreement (test)',
    });
    expect((await asked(customer.customerId)).map((one) => one.status)).toEqual([
      'closed',
      'closed',
    ]);
    expect((await taskRow(stepId))?.status).not.toBe('waiting');
    const [done] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'loan_papers_checked' AND subject_id = $1",
      [stepId],
    );
    expect(done).toBeDefined();
    const [resumed] = await rows(
      "SELECT 1 FROM project_activities WHERE task_id = $1 AND kind = 'resumed'",
      [stepId],
    );
    expect(resumed).toBeDefined();
  });

  it('a paper from WhatsApp ends the wait once the team says Looks good', async () => {
    const sale = await sellProject(admin, { name: 'Loan Check (test)', loan: true });
    const { customer } = sale;
    const stepId = await taskIdOf(sale, 'loan_documents');
    await say(customer.phone, 'hello');
    await admin.post(`/tasks/${stepId}/waiting`, { party: 'customer', note: 'Loan papers (test)' });
    const ask = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'bank_loan',
      title: 'Sanction letter (test)',
      requirementKey: askKeyOf({ category: 'bank_loan', title: 'Sanction letter (test)' }),
    });
    await sendInbound(customer.phone, {
      media: { type: 'document', fileId: `loan-${customer.phone}`, filename: 'sanction.pdf' },
    });
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    const [received] = await rows<{ status: string; document_id: string }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [ask.id],
    );
    expect(received?.status).toBe('received');
    // Received is not checked: the step still waits.
    expect((await taskRow(stepId))?.status).toBe('waiting');
    await admin.post(`/documents/${received?.document_id}/check`);
    expect((await asked(customer.customerId))[0]?.status).toBe('closed');
    expect((await taskRow(stepId))?.status).not.toBe('waiting');
  });

  it('papers asked before the step starts waiting on the customer end that wait when the last is checked', async () => {
    const sale = await sellProject(admin, { name: 'Loan Other Wait (test)', loan: true });
    const { customer } = sale;
    const stepId = await taskIdOf(sale, 'loan_documents');
    await askAll(sale.project.id);
    // The step starts waiting on the customer only now: the papers already asked belong to this wait.
    await admin.post(`/tasks/${stepId}/waiting`, { party: 'customer', note: 'Loan papers (test)' });
    for (const name of ITEMS)
      await upload(admin, 'document', { projectId: sale.project.id, category: 'bank_loan', name });
    expect((await asked(customer.customerId)).map((one) => one.status)).toEqual([
      'closed',
      'closed',
    ]);
    expect((await taskRow(stepId))?.status).not.toBe('waiting');
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'loan_papers_checked' AND subject_id = $1",
      [stepId],
    );
    expect(alert).toBeDefined();
  });
});
