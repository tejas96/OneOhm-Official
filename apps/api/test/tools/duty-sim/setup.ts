import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { pinAndSchedule } from '../../acceptance/support/auto-visits';
import { rows } from '../../acceptance/support/db';
import { Session } from '../../acceptance/support/http';
import { ownPerson } from '../../acceptance/support/people';
import { type Sale, sellProject } from '../../acceptance/support/sales';
import { taskByKey } from '../../acceptance/support/tasks';
import { ensureTeam } from '../../acceptance/support/team';
import { indiaDate } from '../../acceptance/support/travel';
import type { Args } from './args';
import type { LatLng } from './geo';

export interface World {
  admin: Session;
  me: Session;
  worker: { id: string; phone: string; name: string };
  sale: Sale | null;
  taskId: string | null;
  base: { latitude: number; longitude: number } | null;
}

const clock = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());

/** The reporting manager named by phone (+91… or 10 digits); they must already exist. */
async function managerId(phone: string): Promise<string> {
  const e164 = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '').slice(-10)}`;
  const [row] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [e164]);
  if (!row)
    throw new Error(`--manager ${phone}: nobody has that phone in the acceptance database.`);
  return row.id;
}

/**
 * The admin makes (or finds) the worker and, with setup on, a sold project whose site_survey
 * task goes to the worker, with the customer's property pinned at the site and the task
 * scheduled today. Everything goes through the acceptance support helpers.
 */
export async function setup(args: Args, site: LatLng, start: LatLng): Promise<World> {
  const admin = await Session.admin();
  let worker: World['worker'];
  let me: Session;
  if (args.worker) {
    me = await Session.code(args.worker);
    worker = { id: me.userId, phone: args.worker, name: me.name };
  } else {
    if (!args.setup)
      throw new Error('--no-setup needs --worker <phone> (there is nobody to run the day).');
    await ensureTeam(admin);
    worker = await ownPerson(admin, args.name ?? `Sim Worker ${clock()}`, ['execution']);
    me = await Session.code(worker.phone);
  }
  // Travel is paid from where the duty starts: the worker's base is their home, the first waypoint
  // unless --base says otherwise.
  const base = args.base ?? start;
  await admin.patch(`/people/${worker.id}`, {
    base: { latitude: base.latitude, longitude: base.longitude, label: 'Simulator base' },
    ...(args.manager ? { reportsToUserId: await managerId(args.manager) } : {}),
  });
  if (!args.setup) return { admin, me, worker, sale: null, taskId: null, base };
  if (!args.worker) await ensureTeam(admin);
  const sale = await sellProject(admin, { name: 'Sim Customer (test)' });
  const taskId = taskByKey(sale.project, 'site_survey').id;
  await admin.post(`/tasks/${taskId}/assign`, { userId: worker.id });
  await pinAndSchedule(sale.project.id, taskId, site, indiaDate());
  return { admin, me, worker, sale, taskId, base };
}

/** Consent (current version), check-in, then both moved back so the whole trip is "in the past". */
export async function startDuty(world: World, startMs: number): Promise<void> {
  const { me, worker } = world;
  await me.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  await me.post('/attendance/check-in', {});
  const ageSec = Math.ceil((Date.now() - startMs) / 1000);
  // Points before the consent or the check-in are turned away: consent 1 h and check-in 5 min earlier.
  await rows(
    "UPDATE location_consents SET consented_at = now() - make_interval(secs => $2) - interval '1 hour' WHERE user_id = $1",
    [worker.id, ageSec],
  );
  await rows(
    "UPDATE attendance_days SET check_in_at = now() - make_interval(secs => $2) - interval '5 minutes' WHERE user_id = $1 AND check_out_at IS NULL",
    [worker.id, ageSec],
  );
}
