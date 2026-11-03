import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { setManagerTermsAt } from '../support/team-change';

const DAY_MS = 86_400_000;

// A late rating splits by who held the project while the work was done, not up to the rating.
describe('Project team change: rating after completion', () => {
  let admin: Session;
  let first: string;

  beforeAll(async () => {
    admin = await Session.admin();
    const [row] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [
      STAFF.execution.phone,
    ]);
    if (!row) throw new Error('No execution user.');
    first = row.id;
  });
  afterAll(closeDb);

  it('counts terms up to the last finished task, not to the rating', async () => {
    const sale = await sellProject(admin, { name: 'Late Rating (test)' });
    const id = sale.project.id;
    // Finished 200 days ago: A held it 30 days, then B the last 10.
    const done = new Date(Math.floor(Date.now() / 1000) * 1000 - 200 * DAY_MS);
    const at = (days: number) => new Date(done.getTime() - days * DAY_MS);
    await setManagerTermsAt(id, [
      { userId: first, from: at(40), until: at(10) },
      { userId: admin.userId, from: at(10), until: null },
    ]);
    await rows(
      `UPDATE project_tasks SET status = 'completed', completed_at = $2::timestamptz - interval '1 day'
        WHERE project_id = $1`,
      [id, done],
    );
    await rows(
      `UPDATE project_tasks SET completed_at = $2
        WHERE id = (SELECT id FROM project_tasks WHERE project_id = $1 LIMIT 1)`,
      [id, done],
    );
    await rows(`UPDATE projects SET status = 'completed' WHERE id = $1`, [id]);

    const customer = await Session.code(sale.customer.phone, 'customer');
    await customer.post('/customer/feedback', { projectId: id, rating: 5 });

    // goodRating 50 split 75/25: 37.5 / 12.5, the tied half point goes to the earlier term.
    const split = await rows<{ user_id: string; points: number }>(
      `SELECT user_id, points FROM points_entries
        WHERE source_type = 'customer_rating' AND source_id = $1 ORDER BY points DESC`,
      [id],
    );
    expect(split).toEqual([
      { user_id: first, points: 38 },
      { user_id: admin.userId, points: 12 },
    ]);
  });
});
