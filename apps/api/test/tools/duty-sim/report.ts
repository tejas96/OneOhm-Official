import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DutyRoute, TravelDay } from '@oneohm/api-contracts';
import { visitRows } from '../../acceptance/support/auto-visits';
import { indiaDate } from '../../acceptance/support/travel';
import type { Path } from './path';
import type { Tally } from './run';
import type { World } from './setup';
import type { Simulation } from './simulate';

const time = (value: Date | string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
const km = (metres: number) => `${(metres / 1000).toFixed(2)} km`;

/** Plain text of what the server made of the day: route, visits, travel day, claim. */
export async function report(
  world: World,
  tally: Tally,
  sim: Simulation,
  live = false,
): Promise<string> {
  const date = indiaDate();
  const route = await world.me.get<DutyRoute>(`/me/duty-route?date=${date}`);
  const visits = await visitRows(world.worker.id);
  const day = live ? null : await world.me.get<TravelDay>(`/me/travel?date=${date}`);
  const rejected = Object.entries(tally.rejected).map(([why, n]) => `${why} ${n}`);
  const lines = [
    `Worker ${world.worker.name} (${world.worker.phone}), day ${date}`,
    `Points: generated ${sim.points.length + sim.dropped}, dropped for the gap ${sim.dropped}, sent ${tally.sent} in ${tally.batches} batch(es), accepted ${tally.accepted}, rejected ${rejected.length ? rejected.join(', ') : 'none'}`,
    ...tally.errors.map((e) => `  upload error: ${e}`),
    ...tally.fence.map((f) => `Fence: ${f}`),
    `Route: ${route.summary.count} points ${route.summary.firstAt ? time(route.summary.firstAt) : '-'} to ${route.summary.lastAt ? time(route.summary.lastAt) : '-'}, longest gap ${route.summary.maxGapMinutes} min, mocked ${route.summary.mockedCount}`,
    `Site visits: ${visits.length}`,
    ...visits.map(
      (v) =>
        `  in ${time(v.check_in_at)} (${v.check_in_source}${v.delayed ? ', delayed' : ''}) out ${v.check_out_at ? `${time(v.check_out_at)} (${v.check_out_source})` : 'still open'}${v.leave_reason ? `, left: ${v.leave_reason}` : ''}`,
    ),
    `Base saved: ${world.base ? `${world.base.latitude}, ${world.base.longitude}` : 'none'}`,
  ];
  // A live day is still open: there is no saved travel day or claim to show yet.
  if (!day) return [...lines, 'Duty still open (--live): no travel day or claim yet.'].join('\n');
  lines.push(
    `Travel day: route ${km(day.routeM)}, straight from duty start through the site to duty end ${km(day.straightM)}, commute deduct ${km(day.commuteDeductM)}, paid ${km(day.paidM)}, method ${day.method}, cap ${day.capApplied ? 'applied' : 'not applied'}, gaps ${day.gapCount} (${day.gapMinutes} min), mocked ${day.mockedCount}, closed ${day.closed}`,
  );
  const claim = day.claim;
  lines.push(
    claim
      ? `Claim: ${claim.status}, Rs ${(claim.amountPaise / 100).toFixed(2)} (${km(claim.paidM)} at ${claim.ratePaisePerKm} paise/km), auto made ${claim.autoMade}, auto approved ${claim.autoApproved}, review reasons ${claim.reviewReasons.length ? claim.reviewReasons.join(', ') : 'none'}`
      : 'Claim: none made',
  );
  return lines.join('\n');
}

/** The sent points (and the waypoints) as GeoJSON, to open on geojson.io. */
export function writeGeoJson(dir: string, path: Path, sim: Simulation): string {
  mkdirSync(dir, { recursive: true });
  const feature = (coordinates: number[], properties: object) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties,
  });
  const collection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: sim.points.map((p) => [p.body.longitude, p.body.latitude]),
        },
        properties: { name: 'sent points in order', stroke: '#2563eb' },
      },
      ...sim.points.map((p) =>
        feature([p.body.longitude, p.body.latitude], {
          time: p.body.recordedAt,
          minute: Math.round(p.tSec / 6) / 10,
          accuracyM: p.body.accuracyM,
          speedMps: p.body.speedMps,
          battery: p.body.batteryPercent,
          mocked: p.body.mocked,
          'marker-color': p.body.mocked ? '#dc2626' : '#2563eb',
          'marker-size': 'small',
        }),
      ),
      ...path.waypoints.map((w, i) =>
        feature([w.longitude, w.latitude], {
          name: i === path.siteIndex ? 'site' : i === 0 ? 'start' : `waypoint ${i}`,
          'marker-color': i === path.siteIndex ? '#16a34a' : '#6b7280',
          'marker-size': 'large',
        }),
      ),
    ],
  };
  const file = join(dir, `duty-sim-${new Date().toISOString().replace(/[:.]/g, '-')}.geojson`);
  writeFileSync(file, JSON.stringify(collection));
  return file;
}
