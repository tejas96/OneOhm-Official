import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { templateOn } from '../support/visit-worker';
import { askDay, setVisit, visitsFor, visitTask } from '../support/visits';

// Review fixes for visits (phase 3b, fix round 1).

const _alerts = async (kind: string, name: string) =>
  (await rows<{ title: string }>('SELECT title FROM notifications WHERE kind = $1', [kind])).filter(
    (one) => one.title.includes(name),
  );

const workingDayAfter = (day: string, n = 1) => {
  let at = day;
  for (let left = n; left > 0; ) {
    at = addDays(at, 1);
    if (new Date(`${at}T00:00:00Z`).getUTCDay() !== 0) left -= 1;
  }
  return at;
};

describe('Visits: review fixes (taps)', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('two taps at once answer an ask once; a tap on an old reminder does not touch a moved visit', async () => {
    const sale = await sellProject(admin, { name: 'Review Race (test)' });
    const task = await visitTask(sale, 'panel_installation');
    const { list } = await askDay(admin, sale, { taskId: task });
    const row = list?.rows?.find((one) => one.id.startsWith('vday:'));
    const day = row?.id.split(':').slice(2).join(':') ?? '';
    const action = row?.id.split(':')[1] ?? '';
    const taps = ['morning', 'afternoon'].map((slot) =>
      tap(sale.customer.phone, `vslot:${action}:${day}:${slot}`),
    );
    await Promise.all(taps);
    expect(await visitsFor(sale.customer.customerId)).toHaveLength(1);
    const thanks = (await replies(sale.customer.phone)).filter((one) =>
      /^Thanks — we'll confirm/.test(one.body),
    );
    expect(thanks).toHaveLength(1);

    const [visit] = await visitsFor(sale.customer.customerId);
    const moved = await setVisit(admin, {
      taskId: task,
      day: workingDayAfter(visit?.day ?? today(), 1),
      slot: 'morning',
    });
    await tap(sale.customer.phone, `vcf:${visit?.id}:${visit?.day}`);
    expect((await lastReply(sale.customer.phone))?.body).toMatch(
      /^That day changed — your visit is now/,
    );
    expect((await visitsFor(sale.customer.customerId))[0]?.customer_confirmed_at).toBeNull();
    expect(moved.status).toBe('confirmed');
  });

  it('forged taps for a Sunday are refused; the visit message cannot be switched on without its buttons', async () => {
    const sale = await sellProject(admin, { name: 'Review Sunday (test)' });
    const task = await visitTask(sale, 'panel_installation');
    const { list } = await askDay(admin, sale, { taskId: task });
    const action = list?.rows?.[0]?.id.split(':')[1] ?? '';
    let sunday = addDays(today(), 1);
    while (new Date(`${sunday}T00:00:00Z`).getUTCDay() !== 0) sunday = addDays(sunday, 1);
    await tap(sale.customer.phone, `vday:${action}:${sunday}`);
    expect((await lastReply(sale.customer.phone))?.kind).toBe('list');
    const templates = await admin.get<
      {
        key: string;
        metaName: string;
        language: string;
        metaNameMr: string | null;
        metaNameHi: string | null;
        fields: string[];
        preview: string;
      }[]
    >('/settings/message-templates');
    const t = templates.find((one) => one.key === 'visit_pick');
    const refused = await admin.raw('PUT', '/settings/message-templates/visit_pick', {
      ...t,
      active: true,
      extrasApproved: false,
    });
    expect(refused.status).toBe(400);
    const restore = await templateOn('visit_pick', false);
    await restore();
  });
});

const _workingDayAfter = (day: string) => {
  let at = addDays(day, 1);
  if (new Date(`${at}T00:00:00Z`).getUTCDay() === 0) at = addDays(at, 1);
  return at;
};
