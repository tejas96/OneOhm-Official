import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, removeNow, retire } from '../support/people';
import { sellProject, uniquePhone } from '../support/sales';

// QA fix pass: a crew member's tasks leave the work order when they are removed, and a
// new number for someone not signed in yet moves their invite to it.
const TAG = 'people follow-through (test)';

describe('people follow-through', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string, roles?: readonly string[]) => {
    const made = await ownPerson(admin, name, roles);
    people.push(made);
    return made;
  };

  beforeAll(async () => {
    admin = await Session.admin();
  });

  afterAll(async () => {
    await rows('DELETE FROM outbox WHERE dedupe_key LIKE $1', [`${TAG}:%`]);
    await retire(admin, people);
    await closeDb();
  });

  it("a removed crew member's task leaves the crew's work order", async () => {
    const crew = await person('Crew Leaver (follow test)', ['ic_partner']);
    const contractor = await admin.post<{ id: string }>('/contractors', {
      name: `Follow Crew ${Date.now()} (test)`,
      kind: 'company',
      phone: uniquePhone(),
      skills: ['ic_partner'],
      tdsBp: 100,
      retentionBp: 500,
      retentionDays: 90,
      paymentTermsDays: 15,
    });
    await admin.put(`/contractors/${contractor.id}/members`, {
      members: [{ userId: crew.id, lead: true }],
    });
    const sale = await sellProject(admin, { name: 'Crew Handover Project (test)' });
    const [task] = await rows<{ id: string }>(
      "SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed' LIMIT 1",
      [sale.project.id],
    );
    await admin.post(`/tasks/${task?.id}/assign`, { userId: crew.id });
    const linked = () =>
      rows(
        `SELECT 1 FROM work_order_tasks t JOIN work_orders o ON o.id = t.work_order_id
          WHERE t.task_id = $1 AND o.contractor_id = $2`,
        [task?.id, contractor.id],
      );
    expect(await linked()).toHaveLength(1);
    await removeNow(admin, crew.id);
    expect(await linked()).toHaveLength(0);
  });

  it('a new number before the first sign-in moves the invite, codes and queue', async () => {
    const invited = await person('New Number (follow test)');
    const oldPhone = invited.phone;
    await rows(
      `INSERT INTO otp_challenges (phone_e164, code_hash, expires_at)
       VALUES ($1, 'unused', now() + interval '10 minutes')`,
      [oldPhone],
    );
    await rows(
      `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key)
       VALUES ('whatsapp', $1, 'staff_daily_digest', '{}'::jsonb, $2)`,
      [oldPhone, `${TAG}:${invited.id}`],
    );
    const newPhone = uniquePhone();
    // The first invite went out moments ago: the 10-minute wait is only for resends.
    await admin.patch(`/people/${invited.id}`, { phone: newPhone });
    const invites = await rows<{ recipient: string }>(
      `SELECT recipient FROM outbox WHERE template = 'staff_welcome' AND dedupe_key LIKE $1
        ORDER BY created_at`,
      [`staff_welcome:${invited.id}:%`],
    );
    expect(invites.map((row) => row.recipient)).toEqual([oldPhone, newPhone]);
    const codes = await rows(
      'SELECT 1 FROM otp_challenges WHERE phone_e164 = $1 AND consumed_at IS NULL',
      [oldPhone],
    );
    expect(codes).toHaveLength(0);
    const [queued] = await rows<{ status: string }>(
      'SELECT status::text FROM outbox WHERE dedupe_key = $1',
      [`${TAG}:${invited.id}`],
    );
    expect(queued?.status).toBe('skipped');
    invited.phone = newPhone;
  });

  it('a new number after the first sign-in sends no invite', async () => {
    const signedIn = await person('Signed In Number (follow test)');
    await Session.code(signedIn.phone);
    const newPhone = uniquePhone();
    await admin.patch(`/people/${signedIn.id}`, { phone: newPhone });
    const invites = await rows(
      `SELECT 1 FROM outbox WHERE template = 'staff_welcome' AND recipient = $1`,
      [newPhone],
    );
    expect(invites).toHaveLength(0);
    signedIn.phone = newPhone;
  });
});
