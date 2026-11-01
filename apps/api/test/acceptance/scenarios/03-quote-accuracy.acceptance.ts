import type { Inbox, ProjectDetail, QuotationDetail } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { advanceTo, project, surveyFacts, taskByKey, workTask } from '../support/tasks';
import { STAFF } from '../support/team';

// PRD 13 "Quote accuracy": survey variance within tolerance is absorbed; beyond tolerance
// creates a revision for approval (PRD 3.5, Flow A). Material work waits meanwhile.
const HELD = 'Customer’s OK on the revised quotation';

/** Takes a fresh project to an approved site survey with these cable measurements. */
async function surveyed(admin: Session, name: string, meters: (base: number) => number) {
  const sale = await sellProject(admin, { name, targetWp: 3000 });
  const survey = await advanceTo(admin, sale.project.id, 'site_survey');
  const base = await surveyFacts(admin, await project(admin, sale.project.id), survey);
  const facts = {
    dc_cable_meters: String(meters(Number(base.dc_cable_meters))),
    ac_cable_meters: String(meters(Number(base.ac_cable_meters))),
  };
  const done = await workTask(admin, survey, { facts });
  expect(done.status).toBe('completed');
  return { sale, after: await project(admin, sale.project.id) };
}

describe('Quote accuracy', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });

  it('absorbs a small survey difference: budget locked, the customer price unchanged', async () => {
    const { sale, after } = await surveyed(admin, 'Small Variance Customer (test)', (m) => m + 4);
    expect(after.budget.status).toBe('locked');
    expect(after.budget.lockedAt).not.toBeNull();
    expect(after.budget.revisionQuotationId).toBeNull();
    expect(Math.abs(after.budget.varianceBp ?? 0)).toBeLessThanOrEqual(300);
    // Only management sees the difference; the customer's quotation stays as accepted.
    expect(after.quotation.id).toBe(sale.quotation.id);
    expect(after.quotation.totalPaise).toBe(sale.quotation.totalPaise);
    // Material work is free to go once the budget is locked.
    expect(taskByKey(after, 'purchase_order').blockedBy).not.toContain(HELD);
  });

  it('beyond tolerance drafts a revision for approval and holds material work', async () => {
    const { sale, after } = await surveyed(admin, 'Long Cable Customer (test)', (m) => m * 8);
    expect(after.budget.status).toBe('revision_needed');
    expect(after.budget.varianceBp ?? 0).toBeGreaterThan(300);
    const revisionId = after.budget.revisionQuotationId;
    expect(revisionId).not.toBeNull();

    const revision = await admin.get<QuotationDetail>(`/quotations/${revisionId}`);
    expect(revision.status).toBe('draft');
    expect(revision.number).toBe(sale.quotation.number);
    expect(revision.revision).toBe(sale.quotation.revision + 1);
    expect(revision.totalPaise).toBeGreaterThan(sale.quotation.totalPaise);
    // The accepted price still stands until the revision is approved and accepted.
    expect(after.quotation.id).toBe(sale.quotation.id);
    expect(taskByKey(after, 'purchase_order').blockedBy).toContain(HELD);

    // Managers (projects.manage) are asked to review and send the revision.
    const manager = await Session.code(STAFF.execution.phone);
    const inbox = await manager.get<Inbox>('/me/notifications');
    expect(inbox.items.some((item) => item.kind === 'budget_revision')).toBe(true);
  });

  it('once the customer accepts the revision the budget locks again and material moves', async () => {
    const { after } = await surveyed(admin, 'Revision Accept Customer (test)', (m) => m * 8);
    const revisionId = after.budget.revisionQuotationId ?? '';
    await admin.post(`/quotations/${revisionId}/send`);
    await admin.post(`/quotations/${revisionId}/accept`);
    const revised = await admin.get<ProjectDetail>(`/projects/${after.id}`);
    expect(revised.budget.status).toBe('revised');
    expect(revised.quotation.id).toBe(revisionId);
    expect(taskByKey(revised, 'purchase_order').blockedBy).not.toContain(HELD);
  });
});
