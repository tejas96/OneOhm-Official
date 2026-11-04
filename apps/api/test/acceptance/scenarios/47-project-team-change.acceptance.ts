import type { DeliveryReport, ProjectTask, TeamOptions } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { ownPerson, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { project, workTask } from '../support/tasks';
import { STAFF } from '../support/team';
import { patchTeam, setManagerTerms, setManagerTermsAt } from '../support/team-change';

// Changing a project's team must leave a trail: who managed it, and when.
describe('Project team change', () => {
  let admin: Session;
  let manager1: string;
  const userByPhone = async (phone: string) => {
    const [row] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [phone]);
    if (!row) throw new Error(`No user with phone ${phone}`);
    return row.id;
  };
  const terms = (projectId: string) =>
    rows<{ user_id: string; open: boolean }>(
      `SELECT user_id, ended_at IS NULL AS open FROM project_manager_terms
       WHERE project_id = $1 ORDER BY started_at`,
      [projectId],
    );

  beforeAll(async () => {
    admin = await Session.admin();
    manager1 = await userByPhone(STAFF.execution.phone);
  });
  afterAll(closeDb);

  it('records a manager term at creation', async () => {
    const sale = await sellProject(admin, { name: 'Term At Creation (test)' });
    expect((await terms(sale.project.id)).map((row) => [row.user_id, row.open])).toEqual([
      [admin.userId, true],
    ]);
  });

  it('re-saving the same manager adds no term', async () => {
    const sale = await sellProject(admin, {
      name: 'Same Manager (test)',
      managerUserId: manager1,
    });
    const before = await terms(sale.project.id);
    const reply = await patchTeam(admin, sale.project.id, {
      managerUserId: manager1,
    });
    expect(reply.status).toBeLessThan(300);
    const after = await terms(sale.project.id);
    expect(after).toEqual(before);
    expect(after.map((row) => [row.user_id, row.open])).toEqual([[manager1, true]]);
  });

  describe('who may manage and closed projects', () => {
    type Failure = { code?: string; fieldErrors?: Record<string, string> };
    let hr: string;
    beforeAll(async () => {
      hr = await userByPhone(STAFF.hr.phone);
    });

    it('rejects an HR person as manager', async () => {
      const sale = await sellProject(admin, { name: 'HR Manager (test)' });
      const reply = await patchTeam(admin, sale.project.id, { managerUserId: hr });
      expect(reply.status).toBe(400);
      expect((reply.body as Failure).fieldErrors?.managerUserId).toBeTruthy();
    });

    it('rejects an HR person as manager at creation', async () => {
      await expect(
        sellProject(admin, { name: 'HR At Creation (test)', managerUserId: hr }),
      ).rejects.toThrow(/400/);
    });

    it('saves other changes while the manager is inactive', async () => {
      const person = await ownPerson(admin, 'Short Lived Manager (test)', ['execution']);
      const sale = await sellProject(admin, { name: 'Inactive Manager (test)' });
      expect((await patchTeam(admin, sale.project.id, { managerUserId: person.id })).status).toBe(
        200,
      );
      await retire(admin, [person]);
      const reply = await patchTeam(admin, sale.project.id, {
        managerUserId: person.id,
        targetFinishDate: '2099-01-01',
      });
      expect(reply.status).toBe(200);
    });

    it('reviews go to approvers when the manager is inactive', async () => {
      const person = await ownPerson(admin, 'Gone Reviewer (test)', ['execution']);
      const sale = await sellProject(admin, { name: 'Inactive Reviewer (test)' });
      expect((await patchTeam(admin, sale.project.id, { managerUserId: person.id })).status).toBe(
        200,
      );
      const detail = await project(admin, sale.project.id);
      const task = detail.tasks.find(
        (t) =>
          t.status === 'ready' && t.blockedBy.length === 0 && (t.assignee || t.proposedAssignee),
      );
      if (!task) throw new Error('No free task to review.');
      await rows(
        "UPDATE project_tasks SET approval = true, reviewer = 'project_manager' WHERE id = $1",
        [task.id],
      );
      await retire(admin, [person]);
      const submitted = await workTask(admin, task, { approve: false });
      expect(submitted.status).toBe('in_review');
      expect(submitted.reviewerIds).not.toContain(person.id);
      expect(submitted.reviewerIds).toContain(admin.userId);
      const after = await project(admin, sale.project.id);
      const seen = after.tasks.find((t: ProjectTask) => t.id === task.id);
      expect(seen?.reviewerIds).not.toContain(person.id);
      expect(seen?.reviewerIds).toContain(admin.userId);
      const approved = await admin.raw('POST', `/tasks/${task.id}/approve`);
      expect(approved.status).toBe(200);
    });

    it('locks completed projects', async () => {
      const sale = await sellProject(admin, { name: 'Closed Project (test)' });
      await rows('UPDATE projects SET status = $2 WHERE id = $1', [sale.project.id, 'completed']);
      const reply = await patchTeam(admin, sale.project.id, { targetFinishDate: '2099-01-01' });
      expect(reply.status).toBe(409);
      expect((reply.body as Failure).code).toBe('project_closed');
    });

    it('lists who can manage', async () => {
      const options = await admin.get<TeamOptions>('/project-team/options');
      const canManage = (id: string) => options.people.find((p) => p.id === id)?.canManage;
      expect(canManage(manager1)).toBe(true);
      expect(canManage(hr)).toBe(false);
    });
  });

  describe('customer rating points', () => {
    const ratingRows = (projectId: string) =>
      rows<{ user_id: string; points: number; status: string }>(
        `SELECT user_id, points, status FROM points_entries
         WHERE source_type = 'customer_rating' AND source_id = $1 ORDER BY points DESC`,
        [projectId],
      );
    const rate = async (customerPhone: string, projectId: string, rating: number) => {
      const customer = await Session.code(customerPhone, 'customer');
      await customer.post('/customer/feedback', { projectId, rating });
    };
    const soldWithTerms = async (name: string) => {
      const sale = await sellProject(admin, { name });
      await setManagerTerms(sale.project.id, [
        { userId: manager1, days: 30 },
        { userId: admin.userId, days: 20 },
      ]);
      return sale;
    };

    it('splits rating points between old and new manager', async () => {
      const sale = await soldWithTerms('Rating Split (test)');
      await rate(sale.customer.phone, sale.project.id, 5);
      expect(await ratingRows(sale.project.id)).toEqual([
        { user_id: manager1, points: 30, status: 'pending' },
        { user_id: admin.userId, points: 20, status: 'pending' },
      ]);
    });

    it('a re-rating does not double credit', async () => {
      const sale = await soldWithTerms('Re-rating (test)');
      await rate(sale.customer.phone, sale.project.id, 5);
      await rate(sale.customer.phone, sale.project.id, 5);
      const after = await ratingRows(sale.project.id);
      expect(after).toHaveLength(2);
      expect(after.reduce((sum, row) => sum + row.points, 0)).toBe(50);
    });

    it('a low re-rating withdraws pending points', async () => {
      const sale = await soldWithTerms('Low Re-rating (test)');
      await rate(sale.customer.phone, sale.project.id, 5);
      await rows(
        `UPDATE points_entries SET status = 'approved'
         WHERE source_type = 'customer_rating' AND source_id = $1 AND user_id = $2`,
        [sale.project.id, manager1],
      );
      await rate(sale.customer.phone, sale.project.id, 2);
      expect((await ratingRows(sale.project.id)).map((row) => [row.user_id, row.status])).toEqual([
        [manager1, 'approved'],
        [admin.userId, 'cancelled'],
      ]);
    });
  });

  describe('business reports', () => {
    // The report periods are "this month", "last 30 days", "this quarter" and "this year" (India
    // time), so the old manager's term ends just before this month starts.
    const monthStart = () => {
      const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
      return new Date(`${today}-01T00:00:00+05:30`);
    };
    const listed = async (projectId: string, managerId: string, period: string) => {
      const report = await admin.get<DeliveryReport>(
        `/business-reports/delivery?managerUserId=${managerId}&period=${period}`,
      );
      return report.byProject.some((row) => row.projectId === projectId);
    };

    it('the old manager keeps the project in reports for the months they ran it', async () => {
      const sale = await sellProject(admin, { name: 'Report Terms (test)' });
      const handover = new Date(monthStart().getTime() - 3_600_000);
      await setManagerTermsAt(sale.project.id, [
        {
          userId: manager1,
          from: new Date(handover.getTime() - 60 * 86_400_000),
          until: handover,
        },
        { userId: admin.userId, from: handover, until: null },
      ]);
      // The old manager ran it before this month: no longer in this month, still in the year.
      expect(await listed(sale.project.id, manager1, 'this_month')).toBe(false);
      expect(await listed(sale.project.id, admin.userId, 'this_month')).toBe(true);
      // A term that ended inside the range still counts for that range.
      await setManagerTermsAt(sale.project.id, [
        {
          userId: manager1,
          from: new Date(handover.getTime() - 60 * 86_400_000),
          until: new Date(handover.getTime() + 86_400_000),
        },
        {
          userId: admin.userId,
          from: new Date(handover.getTime() + 86_400_000),
          until: null,
        },
      ]);
      expect(await listed(sale.project.id, manager1, 'this_month')).toBe(true);
      expect(await listed(sale.project.id, manager1, 'this_year')).toBe(true);
    });
  });
});
