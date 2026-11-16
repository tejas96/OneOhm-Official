import type { DutyPointsResult, DutySiteRecord } from '@oneohm/api-contracts';
import { inLocationHours } from '../../acceptance/support/travel';
import type { Args } from './args';
import { fenceEvents } from './fence';
import { distanceM, type LatLng } from './geo';
import type { World } from './setup';
import { batches, type Simulation, type Timed } from './simulate';

export interface Tally {
  sent: number;
  accepted: number;
  rejected: Record<string, number>;
  batches: number;
  errors: string[];
  fence: string[];
}

export function newTally(): Tally {
  return { sent: 0, accepted: 0, rejected: {}, batches: 0, errors: [], fence: [] };
}

/** Uploads in batches of up to 200, like the phone, and counts what the server says. */
async function upload(world: World, points: readonly Timed[], tally: Tally): Promise<void> {
  for (const batch of batches(points)) {
    const reply = await world.me.raw<DutyPointsResult>('POST', '/me/duty-points', {
      points: batch.map((p) => p.body),
    });
    tally.batches += 1;
    tally.sent += batch.length;
    if (reply.status !== 200) {
      tally.errors.push(`batch of ${batch.length}: ${reply.status} ${reply.text.slice(0, 200)}`);
      continue;
    }
    tally.accepted += reply.body.accepted;
    for (const r of reply.body.rejected)
      tally.rejected[r.reason] = (tally.rejected[r.reason] ?? 0) + 1;
  }
}

interface FenceSite {
  id: string;
  service: boolean;
  radiusM: number;
}

/** The site the phone would watch: the nearest of today's duty sites to the pin. */
async function fenceSite(world: World, site: LatLng): Promise<FenceSite | null> {
  const sites = await world.me.get<DutySiteRecord[]>('/me/duty-sites');
  const near = sites
    .map((s) => ({ s, gap: distanceM(s, site) }))
    .filter((x) => x.gap < 300)
    .sort((a, b) => a.gap - b.gap)[0];
  return near
    ? { id: near.s.id, service: near.s.kind === 'service', radiusM: near.s.radiusM }
    : null;
}

/** A phone fence event: the same body and endpoint the field app's fence-sender uses. */
async function sendFence(
  world: World,
  site: FenceSite,
  kind: 'check-in' | 'check-out',
  at: string,
  where: Timed,
  tally: Tally,
): Promise<void> {
  const path = site.service
    ? `/service-visits/${site.id}/${kind}`
    : `/tasks/${site.id}/site/${kind}`;
  const reply = await world.me.raw('POST', path, {
    position: {
      latitude: where.body.latitude,
      longitude: where.body.longitude,
      accuracyM: where.body.accuracyM,
    },
    source: 'auto_fence',
    tappedAt: at,
    mocked: false,
  });
  tally.fence.push(
    `${kind} auto_fence at ${at} -> ${reply.status}${reply.status >= 400 ? ` ${reply.text.slice(0, 160)}` : ''}`,
  );
}

/** Posts the day in time order (fence events between the batches), then End duty. */
export async function runDay(
  world: World,
  sim: Simulation,
  args: Args,
  tally: Tally,
): Promise<void> {
  await inLocationHours(world.admin, async () => {
    const site = args.fence ? await fenceSite(world, sim.site) : null;
    if (args.fence && !site)
      tally.fence.push('no duty site near the pin today: fence events skipped');
    const events = site ? fenceEvents(sim.points, sim.site, site.radiusM) : null;
    if (!site || !events?.enter) {
      if (site)
        tally.fence.push('the points never stay 5 minutes inside the fence: no fence events');
      await upload(world, sim.points, tally);
      return;
    }
    const confirm = events.enter.confirmIndex;
    const exit = events.exit?.index ?? sim.points.length - 1;
    await upload(world, sim.points.slice(0, confirm + 1), tally);
    await sendFence(
      world,
      site,
      'check-in',
      events.enter.enteredAt,
      sim.points[confirm] as Timed,
      tally,
    );
    await upload(world, sim.points.slice(confirm + 1, exit + 1), tally);
    if (events.exit) {
      const out = sim.points[exit] as Timed;
      await sendFence(world, site, 'check-out', out.body.recordedAt, out, tally);
    }
    await upload(world, sim.points.slice(exit + 1), tally);
  });
  await world.me.post('/attendance/check-out', {});
}
