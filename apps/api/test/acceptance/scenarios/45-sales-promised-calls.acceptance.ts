import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { lastReply, leadsOf, notesOf, tap, upToSite, withOnboarding } from '../support/onboarding';
import { addDays, today, uniquePhone } from '../support/sales';
import { alertsKeyed, ist, nextActionOf, runSalesChecks } from '../support/sales-checks';
import { sendInbound } from '../support/whatsapp';

// Live review B10: "Call me back" promises a call today only inside working hours, else
// tomorrow morning; when that day's working hours end with no call logged, the owner
// gets one alert. The taps carry tomorrow's times, so they are newer than the onboarding.
const PROMISED = 'Customer asked for a call after the estimate';
const DAY = addDays(today(), 1);

/** Onboarding to the estimate, then "Call me back" tapped at this time; the lead. */
async function askForCall(phone: string, at: Date) {
  await upToSite(phone);
  for (const id of ['ob:site:home', 'ob:bill:2000_3000', 'ob:roof:rcc', 'ob:floors:1'])
    await tap(phone, id);
  await tap(phone, 'ob:photo:later');
  await sendInbound(phone, { listReply: 'ob:done:call', at });
  const [lead] = await leadsOf(phone);
  if (!lead?.owner_user_id) throw new Error('The lead has no owner.');
  return lead;
}

describe('The promised call after the estimate', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  let calledToday: { id: string; owner_user_id: string | null };

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('inside working hours promises a call today', async () => {
    const phone = uniquePhone();
    calledToday = await askForCall(phone, ist(DAY, '11:00'));
    expect(await nextActionOf(calledToday.id)).toMatchObject({ day: DAY, note: PROMISED });
    expect((await lastReply(phone))?.body).toMatch(/will call you today\.$/);
    expect((await notesOf(calledToday.id)).map((row) => row.note)).toContain(
      'Asked for a call today after the estimate',
    );
  });

  it('after working hours promises a call tomorrow morning', async () => {
    const phone = uniquePhone();
    const lead = await askForCall(phone, ist(DAY, '21:00'));
    expect(await nextActionOf(lead.id)).toMatchObject({ day: addDays(DAY, 1), note: PROMISED });
    expect((await lastReply(phone))?.body).toMatch(/will call you tomorrow morning\.$/);
    expect((await notesOf(lead.id)).map((row) => row.note)).toContain(
      'Asked for a call tomorrow morning after the estimate',
    );
  });

  it('at the end of the working day a promised call not logged alerts the owner once', async () => {
    const key = `call_promised:${calledToday.id}:${DAY}`;
    await runSalesChecks(admin, ist(DAY, '18:00'));
    expect(await alertsKeyed(key)).toEqual([]);

    await runSalesChecks(admin, ist(DAY, '18:31'));
    const told = await alertsKeyed(key);
    expect(told.map((alert) => alert.user_id)).toEqual([calledToday.owner_user_id]);

    await runSalesChecks(admin, ist(DAY, '22:00'));
    expect(await alertsKeyed(key)).toHaveLength(1);
  });

  it('a call logged on the lead since the promise raises no alert', async () => {
    const lead = await askForCall(uniquePhone(), ist(DAY, '11:00'));
    await admin.post(`/leads/${lead.id}/activities`, { kind: 'call', note: 'Called (test)' });
    await runSalesChecks(admin, ist(DAY, '18:31'));
    expect(await alertsKeyed(`call_promised:${lead.id}:`)).toEqual([]);
  });
});
