import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';

// A paper the customer sent waits for the team's check (redesign §2.3): the person who asked is told
// after 1 working day, the manager after 2, and a second answer after "Ask again" is checked afresh.

const at = (day: string, utc: string) => new Date(`${day}T${utc}:00Z`);
const MONDAY = '2026-11-09';

describe('Papers: the team check deadline', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const answer = (id: string, answeredAt: Date) =>
    rows(
      `UPDATE customer_actions SET status = 'received', done_at = $2::timestamptz, updated_at = $2::timestamptz,
              created_at = $2::timestamptz - interval '1 hour'
        WHERE id = $1`,
      [id, answeredAt],
    );
  const alerts = (id: string) =>
    rows<{ dedupe_key: string; title: string }>(
      "SELECT dedupe_key, title FROM notifications WHERE kind = 'customer_action_check' AND dedupe_key LIKE $1",
      [`action_check:${id}:%`],
    );
  const tell = (when: Date) => queueActionChecks(acceptanceDb().db, when);

  it('owner after 1 working day, manager after 2; Ask again starts the check over', async () => {
    const { project } = await sellProject(admin, { name: 'Paper Check (test)' });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Electricity bill',
    });
    await answer(asked.id, at(MONDAY, '04:00'));
    await tell(at(MONDAY, '12:00'));
    expect(await alerts(asked.id)).toHaveLength(0);
    await tell(at('2026-11-10', '06:00'));
    const owner = await alerts(asked.id);
    expect(owner.length).toBeGreaterThan(0);
    expect(owner.every((one) => one.dedupe_key.includes(':owner'))).toBe(true);
    expect(owner[0]?.title).toBe('Check the Electricity bill Paper Check (test) sent');
    await tell(at('2026-11-11', '06:00'));
    expect((await alerts(asked.id)).some((one) => one.dedupe_key.includes(':manager'))).toBe(true);

    // Ask again, then a second answer: the earlier tier does not hide it.
    await answer(asked.id, at('2026-11-12', '04:00'));
    const before = (await alerts(asked.id)).length;
    await tell(at('2026-11-13', '06:00'));
    const after = await alerts(asked.id);
    expect(after.length).toBeGreaterThan(before);
    const second = `:owner:${at('2026-11-12', '04:00').getTime()}`;
    expect(after.filter((one) => one.dedupe_key.includes(second))).not.toHaveLength(0);
  });
});
