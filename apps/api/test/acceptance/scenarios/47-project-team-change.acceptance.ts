import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { patchTeam, setManagerTerms } from '../support/team-change';

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

  // Needs ProjectTeamService.update to write terms (Task 8).
  it.todo('records a manager term at creation and on each change');

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
    const reply = await patchTeam(admin, sale.project.id, { managerUserId: manager1 });
    expect(reply.status).toBeLessThan(300);
    const after = await terms(sale.project.id);
    expect(after).toEqual(before);
    expect(after.map((row) => [row.user_id, row.open])).toEqual([[manager1, true]]);
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
});
