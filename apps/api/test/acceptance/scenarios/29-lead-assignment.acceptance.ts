import type { LeadAssignmentRulesRecord, LeaveRequestRecord } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, today, uniquePhone } from '../support/sales';
import { RESELLERS, staffEmail, staffId, TEAM_PASSWORD } from '../support/team';

// Part 2, task 2: a lead nobody picked goes to someone who is at work today, by the
// Settings rule. When everyone is away it goes to the desk (the Super Admin) with an
// alert, never ownerless. Other scenarios' sales people share this database, so they are
// sent on leave for this scenario (rows tagged below) and brought back at the end.
const TAG = 'lead-assignment scenario (test)';
const CITY = 'Satara (test)';

/** Approved leave for these people on these days, tagged so it can be taken back. */
async function sendOnLeave(ids: readonly string[], from: string, to = from): Promise<void> {
  for (const id of ids) {
    await rows(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_day, half_days, status, reason)
       VALUES ($1, 'casual', $2, $3, false, 2, 'approved', $4)`,
      [id, from, to, TAG],
    );
  }
}

const bringBack = (ids: readonly string[]) =>
  rows('DELETE FROM leave_requests WHERE user_id = ANY($1::uuid[])', [ids]);

const setRule = (value: unknown) =>
  rows(
    `INSERT INTO business_settings (key, value) VALUES ('lead_assignment', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(value)],
  );

async function ownerOf(phone: string): Promise<string | null> {
  const [lead] = await rows<{ owner_user_id: string | null }>(
    `SELECT owner_user_id FROM leads WHERE phone_e164 = $1 AND stage NOT IN ('won', 'lost')`,
    [phone],
  );
  return lead?.owner_user_id ?? null;
}

/** The website form, as a visitor sends it. Returns the new lead's owner. */
async function websiteLead(name: string, city = 'Sangli'): Promise<string | null> {
  const phone = uniquePhone();
  const reply = await new Session().raw('POST', '/public/leads', { name, phone, city });
  expect(reply.status).toBe(202);
  return ownerOf(phone);
}

describe('Lead assignment', () => {
  let admin: Session;
  let hr: Session;
  let aarav: OwnPerson;
  let bhavna: OwnPerson;
  let zoya: OwnPerson | undefined;
  let desk: string[];
  let others: string[];

  beforeAll(async () => {
    admin = await Session.admin();
    hr = await Session.password(staffEmail('hr'), TEAM_PASSWORD);
    aarav = await ownPerson(admin, 'Aarav Lead (test)', ['sales']);
    bhavna = await ownPerson(admin, 'Bhavna Lead (test)', ['sales']);
    const holders = await rows<{ id: string; system: boolean }>(
      `SELECT DISTINCT u.id, r.system FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.archived_at IS NULL AND r.kind = 'staff'
       JOIN role_capabilities rc ON rc.role_id = r.id AND rc.capability = 'leads.manage'
       WHERE u.status = 'active'`,
    );
    desk = holders.filter((row) => row.system).map((row) => row.id);
    const mine = new Set([aarav.id, bhavna.id, ...desk]);
    others = [...new Set(holders.map((row) => row.id))].filter((id) => !mine.has(id));
    await sendOnLeave(others, today());
  });

  afterAll(async () => {
    await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    await bringBack([aarav.id, bhavna.id]);
    await rows(`DELETE FROM business_settings WHERE key = 'lead_assignment'`);
    await retire(admin, zoya ? [aarav, bhavna, zoya] : [aarav, bhavna]);
    await closeDb();
  });

  it('skips the person on approved leave today', async () => {
    const away = await Session.code(aarav.phone);
    const window = { leaveType: 'casual', fromDate: today(), toDate: today(), halfDay: false };
    const asked = await away.post<LeaveRequestRecord>('/leave', window);
    const approved = await hr.post<LeaveRequestRecord>(`/leave/${asked.id}/decide`, {
      approve: true,
    });
    expect(approved.status).toBe('approved');

    expect(await websiteLead('Skips Leave Lead (test)')).toBe(bhavna.id);
  });

  it('gives the lead to the desk and alerts the people at work when all are away', async () => {
    await sendOnLeave([bhavna.id], today());
    const phone = uniquePhone();
    const reply = await new Session().raw('POST', '/public/leads', {
      name: 'Everyone Away Lead (test)',
      phone,
      city: 'Sangli',
    });
    expect(reply.status).toBe(202);
    const owner = await ownerOf(phone);
    expect(owner).not.toBeNull();
    expect(desk).toContain(owner);

    const alerts = await rows<{ user_id: string; title: string; body: string }>(
      `SELECT n.user_id, n.title, n.body FROM notifications n
       JOIN leads l ON l.id = n.subject_id
       WHERE l.phone_e164 = $1 AND n.title = 'New lead needs an owner'`,
      [phone],
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.body).toBe(
      'Everyone Away Lead (test) came in while everyone is away. Pick an owner.',
    );
    // Bhavna is away with nobody covering: the alert goes to people at work (live review B8).
    expect(alerts.map((row) => row.user_id)).not.toContain(bhavna.id);
    await bringBack([aarav.id, bhavna.id]);
  });

  it('does not count leave that ended yesterday', async () => {
    await sendOnLeave([bhavna.id], addDays(today(), -3), addDays(today(), -1));
    await sendOnLeave([aarav.id], today());
    expect(await websiteLead('Leave Ended Lead (test)')).toBe(bhavna.id);
    await bringBack([aarav.id, bhavna.id]);
  });

  it('spreads three leads to three people by round robin', async () => {
    zoya = await ownPerson(admin, 'Zoya City (test)', ['sales']);
    await setRule({ strategy: 'round_robin', cityOwners: [] });
    // A reseller's lead is assigned by the same rule as the website's.
    const reseller = await Session.code(RESELLERS.first.phone);
    const owners: (string | null)[] = [];
    for (const n of [1, 2, 3]) {
      const phone = uniquePhone();
      await reseller.post('/leads', {
        name: `Round Robin Lead ${n} (test)`,
        phone,
        city: 'Sangli',
        subsidyCategory: 'individual',
        nextActionOn: today(),
      });
      owners.push(await ownerOf(phone));
    }
    expect(new Set(owners)).toEqual(new Set([aarav.id, bhavna.id, zoya.id]));
  });

  it("gives a city's leads to its city owner", async () => {
    if (!zoya) throw new Error('The round robin step makes Zoya.');
    // Least busy would pick Aarav (fewest leads, first by name); the city comes first.
    await setRule({ strategy: 'least_busy', cityOwners: [{ userId: zoya.id, cities: [CITY] }] });
    expect(await websiteLead('City Owner Lead (test)', CITY)).toBe(zoya.id);
  });

  it('saves and reads the lead rule; refuses a person who cannot own leads', async () => {
    const saved = await admin.put<LeadAssignmentRulesRecord>('/settings/lead-assignment', {
      strategy: 'round_robin',
      cityOwners: [{ userId: aarav.id, cities: ['  Pune ', '', 'Satara', 'Pune'] }],
    });
    expect(saved).toEqual({
      strategy: 'round_robin',
      cityOwners: [
        {
          userId: aarav.id,
          cities: ['Pune', 'Satara'],
          name: 'Aarav Lead (test)',
          inactive: false,
        },
      ],
    });
    expect(await admin.get<LeadAssignmentRulesRecord>('/settings/lead-assignment')).toEqual(saved);

    // A person left with no city is refused by name, not dropped while it says "Saved".
    const blank = await admin.raw('PUT', '/settings/lead-assignment', {
      strategy: 'least_busy',
      cityOwners: [{ userId: aarav.id, cities: [' ', ''] }],
    });
    expect(blank.status).toBe(400);

    const accountant = await staffId(admin, 'accounts');
    const refused = await admin.raw('PUT', '/settings/lead-assignment', {
      strategy: 'least_busy',
      cityOwners: [{ userId: accountant, cities: ['Pune'] }],
    });
    expect(refused.status).toBe(400);
    expect(await admin.get<LeadAssignmentRulesRecord>('/settings/lead-assignment')).toEqual(saved);
  });

  it("keeps a staff member's own pick", async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Own Pick Lead (test)',
      phone,
      city: CITY,
      subsidyCategory: 'individual',
      nextActionOn: today(),
      ownerUserId: bhavna.id,
    });
    expect(await ownerOf(phone)).toBe(bhavna.id);
  });
});
