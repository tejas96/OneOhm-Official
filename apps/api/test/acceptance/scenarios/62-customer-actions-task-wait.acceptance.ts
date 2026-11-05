import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endWaitsOnAnsweredAsks } from '../../../../worker/src/activities/task-wait-asks';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { project } from '../support/tasks';
import { askAboutFiles } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Redesign §2.3: a step waiting on the customer opens again by itself once everything asked of them
// is checked; while a paper is still open or waiting for the check, the step keeps waiting.

const taskOf = async (id: string) =>
  (
    await rows<{ status: string; since: Date | null }>(
      'SELECT status::text AS status, waiting_since AS since FROM project_tasks WHERE id = $1',
      [id],
    )
  )[0];

describe('A step waiting on the customer', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('opens again when the paper it waited for is checked, and its owner is told', async () => {
    const sale = await sellProject(admin, { name: 'Wait Ends (test)' });
    const { phone } = sale.customer;
    await say(phone, 'hello');
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'customer_kyc',
      title: 'Aadhaar card (test)',
      requirementKey: 'kyc',
    });
    const detail = await project(admin, sale.project.id);
    const task = detail.tasks.find((one) => one.status === 'ready') ?? detail.tasks[0];
    if (!task) throw new Error('no task');
    await admin.post(`/tasks/${task.id}/waiting`, { party: 'customer', note: 'Aadhaar card' });
    const run = () => endWaitsOnAnsweredAsks(acceptanceDb().db, new Date());

    // Still open: nothing moves.
    await run();
    expect((await taskOf(task.id))?.status).toBe('waiting');
    await sendInbound(phone, {
      media: { type: 'document', fileId: `kyc-wait-${phone}`, filename: 'aadhaar.pdf' },
    });
    await askAboutFiles(admin);
    await tap(phone, 'what:yes');
    // Received but not checked: still waiting.
    await run();
    expect((await taskOf(task.id))?.status).toBe('waiting');
    const [action] = await rows<{ document_id: string }>(
      'SELECT document_id FROM customer_actions WHERE id = $1',
      [asked.id],
    );
    await admin.post(`/documents/${action?.document_id}/check`, {});
    await run();
    const after = await taskOf(task.id);
    expect(after?.status).not.toBe('waiting');
    expect(after?.since).toBeNull();
    const log = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE task_id = $1 AND kind = 'resumed'",
      [task.id],
    );
    expect(log.at(-1)?.message).toContain('everything asked from the customer is done');
    // A second run changes nothing.
    await run();
    expect(
      await rows("SELECT 1 FROM project_activities WHERE task_id = $1 AND kind = 'resumed'", [
        task.id,
      ]),
    ).toHaveLength(log.length);
  });
});
