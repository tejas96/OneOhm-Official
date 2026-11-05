import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { HOUR, NOON, nudgesTo, runNudges, silentFor } from '../support/nudges';
import { chatOf, leadsOf, say, tap, withOnboarding } from '../support/onboarding';
import { newCustomer, today, uniquePhone } from '../support/sales';
import { pastWeekday } from '../support/work-days';

// Part 3, task 7 (fix round 1): the stalled-chat job acts once per chat, leaves customers,
// closed leads and chats a person has alone, and records a failing chat in the job runs.
describe('Onboarding nudge guards', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  const silent = silentFor;
  const run = (now = NOON) => runNudges(admin, now);
  const nudges = nudgesTo;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, {
      enabled: true,
      serviceCities: ['Pune'],
      nudgeAfterHours: 3,
    });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  const stalledAtName = async (phone: string, hours = 4) => {
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await silent(phone, hours);
  };

  it('makes the lead once: no new lead after sales marks it lost', async () => {
    const phone = uniquePhone();
    await stalledAtName(phone);
    await run();
    const [lead] = await leadsOf(phone);
    expect((await chatOf(phone)).ob).toHaveProperty('followedUpAt');
    await rows(`UPDATE leads SET stage = 'lost' WHERE id = $1`, [lead?.id]);
    await run();
    await run(new Date(NOON.getTime() + HOUR));
    expect(await leadsOf(phone)).toHaveLength(1);
  });

  it('a chat stalled in the evening gets its lead at night and its nudge next morning', async () => {
    // A past weekday evening: it and the next morning (a working one) are both in the past.
    const evening = new Date(`${pastWeekday(2)}T21:00:00+05:30`);
    const morning = new Date(evening.getTime() + 13 * HOUR);
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await silent(phone, 4, evening);
    await run(evening);
    expect(await leadsOf(phone)).toHaveLength(1);
    expect(await nudges(phone)).toHaveLength(0);
    // 17 hours silent: still inside WhatsApp's 24 hours, and now working time.
    await run(morning);
    expect(await nudges(phone)).toHaveLength(1);
    await run(new Date(morning.getTime() + HOUR));
    expect(await nudges(phone)).toHaveLength(1);
    expect(await leadsOf(phone)).toHaveLength(1);
  });

  it('makes a new lead for a number whose old lead was lost before this chat began', async () => {
    const phone = uniquePhone();
    const old = await admin.post<{ id: string }>('/leads', {
      name: 'Old lead (test)',
      phone,
      city: 'Pune',
      nextActionOn: today(),
    });
    await rows(`UPDATE leads SET stage = 'lost' WHERE id = $1`, [old.id]);
    await stalledAtName(phone);
    expect((await chatOf(phone)).ob).toHaveProperty('startedAt');
    await run();
    const found = await leadsOf(phone);
    expect(found).toHaveLength(2);
    expect(found.find((lead) => lead.id !== old.id)?.next_action_on).toBe(today());
    await run();
    expect(await leadsOf(phone)).toHaveLength(2);
  });

  it('leaves alone a number that became a customer, and a lead staff made meanwhile', async () => {
    const asked = uniquePhone();
    await stalledAtName(asked);
    const made = await newCustomer(admin, { name: 'Nudge Customer (test)' });
    await rows(`UPDATE customers SET phone_e164 = $1 WHERE id = $2`, [asked, made.customerId]);
    const linked = uniquePhone();
    await stalledAtName(linked);
    await rows(`UPDATE wa_conversations SET customer_id = $2 WHERE phone = $1`, [
      linked,
      made.customerId,
    ]);
    const staffMade = uniquePhone();
    await stalledAtName(staffMade);
    await admin.post('/leads', {
      name: 'Staff lead (test)',
      phone: staffMade,
      city: 'Pune',
      nextActionOn: today(),
    });
    await run();
    expect(await leadsOf(asked)).toEqual([]);
    expect(await leadsOf(linked)).toEqual([]);
    expect(await nudges(asked)).toHaveLength(0);
    expect(await nudges(linked)).toHaveLength(0);
    expect(await leadsOf(staffMade)).toHaveLength(1);
  });

  it('skips chats a person has, finished chats and chats silent over 7 days', async () => {
    const human = uniquePhone();
    await stalledAtName(human);
    await rows(`UPDATE wa_conversations SET state = 'human' WHERE phone = $1`, [human]);
    const finished = uniquePhone();
    await stalledAtName(finished);
    await rows(`UPDATE wa_conversations SET state = 'onboard:done' WHERE phone = $1`, [finished]);
    const old = uniquePhone();
    await stalledAtName(old, 24 * 8);
    await run();
    for (const phone of [human, finished, old]) {
      expect(await leadsOf(phone)).toEqual([]);
      expect(await nudges(phone)).toHaveLength(0);
    }
  });

  it('records a failing chat in the job runs and still handles the others', async () => {
    // A lead named "Break (test)" is refused by the database, so that one chat fails.
    await rows(`CREATE OR REPLACE FUNCTION refuse_break_lead() RETURNS trigger AS $$
      BEGIN IF NEW.name = 'Break (test)' THEN RAISE EXCEPTION 'refused'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await rows(`CREATE TRIGGER refuse_break_lead BEFORE INSERT ON leads
      FOR EACH ROW EXECUTE FUNCTION refuse_break_lead()`);
    const broken = uniquePhone();
    await stalledAtName(broken);
    await rows(`UPDATE wa_conversations SET profile_name = 'Break (test)' WHERE phone = $1`, [
      broken,
    ]);
    const fine = uniquePhone();
    await stalledAtName(fine);
    try {
      await run();
      expect(await leadsOf(fine)).toHaveLength(1);
      expect(await leadsOf(broken)).toEqual([]);
      const [failed] = await rows<{ error: string }>(
        `SELECT error FROM job_runs WHERE name = 'onboarding_nudges' AND status = 'failed'
          ORDER BY created_at DESC LIMIT 1`,
      );
      expect(failed?.error).toContain('1 chats failed');
    } finally {
      await rows(`DROP TRIGGER refuse_break_lead ON leads`);
      await rows(`UPDATE wa_conversations SET state = 'human' WHERE phone = $1`, [broken]);
    }
  });
});
