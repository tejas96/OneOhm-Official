import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { queuePaperReminders } from '../../../../worker/src/activities/paper-reminders';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { askLocation } from '../support/send';

// An open ask nobody answered (redesign §2.3): the person who asked hears from 4 days, in working hours only
// (Sunday is closed); the project manager (else the desk) hears too from 7 days.

const TZ = 'Asia/Kolkata';
const ASKED = new Date('2026-11-04T04:00:00Z'); // Wednesday morning
const SUNDAY = new Date('2026-11-08T06:00:00Z'); // 4 days later
const MONDAY = new Date('2026-11-09T06:00:00Z'); // 5 days later
const NEXT_THURSDAY = new Date('2026-11-12T06:00:00Z'); // 8 days later

describe('Open asks: the team alert and the manager step', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const alerts = (prefix: string) =>
    rows<{ dedupe_key: string }>('SELECT dedupe_key FROM notifications WHERE dedupe_key LIKE $1', [
      `${prefix}%`,
    ]);

  it('a location ask: nothing on Sunday, the asker on Monday, the manager at 7 days', async () => {
    const sale = await sellProject(admin, { name: 'Escalate Location (test)' });
    await askLocation(admin, { projectId: sale.project.id });
    const [ask] = await rows<{ id: string }>(
      "UPDATE customer_actions SET created_at = $2 WHERE customer_id = $1 AND type = 'location' RETURNING id",
      [sale.customer.customerId, ASKED],
    );
    const waiting = `action_waiting:${ask?.id}`;
    const tick = (now: Date) => queueActionReminders(acceptanceDb().db, now, TZ);
    await tick(SUNDAY);
    expect(await alerts(waiting)).toHaveLength(0);
    await tick(MONDAY);
    const asker = await alerts(waiting);
    expect(asker.length).toBeGreaterThan(0);
    expect(asker.some((one) => one.dedupe_key.includes(':manager'))).toBe(false);
    await tick(NEXT_THURSDAY);
    expect((await alerts(`${waiting}:manager`)).length).toBeGreaterThan(0);
  });

  it('a paper request: the same steps, once per round', async () => {
    const sale = await sellProject(admin, { name: 'Escalate Paper (test)' });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'electricity_bill',
      title: 'Electricity bill',
    });
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [asked.id, ASKED]);
    const waiting = `paper_waiting:${asked.id}:0`;
    const tick = (now: Date) => queuePaperReminders(acceptanceDb().db, now, TZ);
    await tick(SUNDAY);
    expect(await alerts(waiting)).toHaveLength(0);
    await tick(MONDAY);
    expect((await alerts(waiting)).length).toBeGreaterThan(0);
    expect(await alerts(`${waiting}:manager`)).toHaveLength(0);
    await tick(NEXT_THURSDAY);
    const manager = await alerts(`${waiting}:manager`);
    expect(manager.length).toBeGreaterThan(0);
    await tick(NEXT_THURSDAY);
    expect(await alerts(`${waiting}:manager`)).toHaveLength(manager.length);
  });
});
