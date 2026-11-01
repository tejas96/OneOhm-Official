import type { ProjectTask } from '@oneohm/api-contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { upload } from '../support/files';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { factsFor, project, sessionOf, surveyFacts, taskByKey, workTask } from '../support/tasks';
import { STAFF, staffEmail, TEAM_PASSWORD } from '../support/team';

// PRD 13 "Task completion": required evidence and approvals are enforced; uploads retry
// until they succeed.
//
// Upload retry is the field app's offline queue, not the API: it is covered by the unit
// tests in apps/field/src/features/uploads/queue-logic.test.ts ("retrying": backs off and
// repeats the longest wait, retries by itself only when the failure can pass, sends a
// refused file again only when asked, tries waiting uploads at once when back online;
// "papers for a lead or a customer": kept after a restart, retrying like task evidence).
describe('Task completion', () => {
  let admin: Session;
  let sale: Sale;
  let surveyor: Session;
  let survey: ProjectTask;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Evidence Customer (test)' });
    const detail = await project(admin, sale.project.id);
    await workTask(admin, taskByKey(detail, 'electricity_details'));
    survey = taskByKey(detail, 'site_survey');
    expect(survey.assignee?.fullName).toBe(STAFF.execution.name);
    surveyor = await sessionOf(admin, survey.assignee?.id ?? '');
    await surveyor.post(`/tasks/${survey.id}/start`);
  });

  it('refuses to complete without the facts the task records', async () => {
    const reply = await surveyor.raw<{ fieldErrors?: Record<string, string> }>(
      'POST',
      `/tasks/${survey.id}/complete`,
      { facts: {} },
    );
    expect(reply.status).toBe(400);
    expect(Object.keys(reply.body.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['site_floors', 'dc_cable_meters']),
    );
  });

  it('refuses to complete without the site photo the task needs', async () => {
    const facts = factsFor(
      survey,
      await surveyFacts(admin, await project(admin, sale.project.id), survey),
    );
    const reply = await surveyor.raw<{ message: string }>('POST', `/tasks/${survey.id}/complete`, {
      facts,
    });
    // A missing file is a conflict with what the task needs (code evidence_missing).
    expect(reply.status).toBe(409);
    expect(reply.text).toContain('evidence_missing');
    expect(reply.text).toMatch(/photo/i);
    const fresh = taskByKey(await project(admin, sale.project.id), 'site_survey');
    expect(fresh.status).toBe('in_progress');
    expect(fresh.missingEvidence).toContain('photo');
  });

  it('sends evidence-complete work to review, never straight to done', async () => {
    await upload(surveyor, 'photo', { taskId: survey.id });
    const facts = factsFor(
      survey,
      await surveyFacts(admin, await project(admin, sale.project.id), survey),
    );
    const sent = await surveyor.post<ProjectTask>(`/tasks/${survey.id}/complete`, { facts });
    expect(sent.status).toBe('in_review');
    expect(sent.missingEvidence).toEqual([]);
    expect(sent.reviewerIds).not.toContain(surveyor.userId);
  });

  it('does not let the doer approve their own work', async () => {
    const own = await surveyor.raw('POST', `/tasks/${survey.id}/approve`);
    expect(own.status).toBe(403);
    expect(own.text).toMatch(/someone else approves/i);
  });

  it('does not let someone without approval rights approve it', async () => {
    const sales = await Session.password(staffEmail('sales'), TEAM_PASSWORD);
    const reply = await sales.raw('POST', `/tasks/${survey.id}/approve`);
    expect(reply.status).toBe(403);
    const still = taskByKey(await project(admin, sale.project.id), 'site_survey');
    expect(still.status).toBe('in_review');
  });

  it('completes once another approver signs it off', async () => {
    const approved = await admin.post<ProjectTask>(`/tasks/${survey.id}/approve`);
    expect(approved.status).toBe('completed');
    const again = await admin.raw('POST', `/tasks/${survey.id}/approve`);
    expect(again.status).toBe(409);
  });

  it('sends work back for correction and counts the rework', async () => {
    const design = taskByKey(await project(admin, sale.project.id), 'system_design');
    const designer = await sessionOf(admin, design.assignee?.id ?? '');
    const sent = await workTask(admin, design, { as: designer, approve: false });
    expect(sent.status).toBe('in_review');

    const returned = await admin.post<ProjectTask>(`/tasks/${design.id}/return`, {
      reason: 'Layout misses the water tank shadow (test)',
    });
    expect(returned.status).not.toBe('in_review');
    expect(returned.status).not.toBe('completed');
    expect(returned.returned?.note).toMatch(/water tank/);
    expect(returned.reworkCount).toBe(1);

    const resent = await designer.post<ProjectTask>(`/tasks/${design.id}/complete`, {
      facts: factsFor(design),
      note: 'Layout moved away from the tank (test)',
    });
    expect(resent.status).toBe('in_review');
    const done = await admin.post<ProjectTask>(`/tasks/${design.id}/approve`);
    expect(done.status).toBe('completed');
    expect(done.reworkCount).toBe(1);
  });

  it('refuses work that is still waiting for earlier tasks', async () => {
    const detail = await project(admin, sale.project.id);
    const blocked = detail.tasks.find(
      (task) => task.status !== 'completed' && task.blockedBy.length > 0,
    );
    expect(blocked).toBeDefined();
    const reply = await admin.raw('POST', `/tasks/${blocked?.id}/complete`, {
      facts: blocked ? factsFor(blocked) : {},
    });
    expect(reply.status).toBe(409);
    expect(reply.text).toMatch(/waiting for/i);
  });
});
