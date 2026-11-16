import { randomUUID } from 'node:crypto';
import { distanceM, gaussian, type LatLng, offsetM, seeded } from './geo';
import { cumulative, distanceAlongNearest, type Path, positionAt } from './path';

/** The phone's own rule: a point every 2 minutes or every 100 metres, whichever comes first. */
export const EVERY_SEC = 120;
export const EVERY_M = 100;
export const BATCH_MAX = 200;

export interface Sample {
  tSec: number;
  at: LatLng;
  speedMps: number;
  heading: number | null;
}

export interface Motion {
  totalSec: number;
  arriveSec: number;
  leaveSec: number;
  at(tSec: number): Sample;
}

/** How the trip ends: at the site without leaving (`stay`), then standing still `idleMin`. */
export interface TripEnd {
  readonly stay?: boolean | undefined;
  readonly idleMin?: number | undefined;
}

/**
 * Drive to the site at a steady speed, stand there for the dwell, then drive on to the end
 * (or stay at the site), then stand still for `idleMin`.
 */
export function motion(path: Path, speedKmh: number, dwellMin: number, end: TripEnd = {}): Motion {
  const cum = cumulative(path.line);
  const length = cum[cum.length - 1] ?? 0;
  const site = path.waypoints[path.siteIndex] as LatLng;
  const siteDist = distanceAlongNearest(path.line, cum, site);
  const v = speedKmh / 3.6;
  const arriveSec = siteDist / v;
  const leaveSec = arriveSec + dwellMin * 60;
  const driveEnd = end.stay ? leaveSec : leaveSec + (length - siteDist) / v;
  const totalSec = driveEnd + (end.idleMin ?? 0) * 60;
  return {
    totalSec,
    arriveSec,
    leaveSec,
    at(tSec) {
      // Standing at the site, standing still after the trip, or staying at the site to the end.
      const dwelling =
        (tSec >= arriveSec && (tSec < leaveSec || end.stay === true)) || tSec > driveEnd;
      const d =
        tSec < arriveSec
          ? v * tSec
          : tSec < leaveSec || end.stay
            ? siteDist
            : Math.min(length, siteDist + v * (tSec - leaveSec));
      const spot = positionAt(path.line, cum, d);
      return {
        tSec,
        at: spot.at,
        speedMps: dwelling ? 0 : v,
        heading: dwelling ? null : spot.heading,
      };
    },
  };
}

/** The readings the phone would record: first, then every 120 s or 100 m, and the last. */
export function resample(
  m: Pick<Motion, 'totalSec' | 'at'>,
  everySec = EVERY_SEC,
  everyM = EVERY_M,
) {
  const out: Sample[] = [];
  let last: Sample | null = null;
  const end = Math.floor(m.totalSec);
  for (let t = 0; t <= end; t += 1) {
    const sample = m.at(t);
    if (!last || t - last.tSec >= everySec || distanceM(last.at, sample.at) >= everyM) {
      out.push(sample);
      last = sample;
    }
  }
  if (last && last.tSec < m.totalSec) out.push(m.at(m.totalSec));
  return out;
}

/** One point exactly as the phone's POST /me/duty-points body carries it. */
export interface PointBody {
  id: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  speedMps: number;
  headingDeg: number | null;
  altitudeM: number;
  mocked: boolean;
  batteryPercent: number;
  charging: boolean;
  network: 'cellular';
}
export interface Timed {
  tSec: number;
  truth: LatLng;
  body: PointBody;
}

export interface SimConfig {
  speedKmh: number;
  dwellMin: number;
  /** Epoch ms of the start of duty (T0). */
  startMs: number;
  seed: number;
  noiseM?: number;
  gap?: [number, number] | undefined;
  fake?: number | undefined;
  jump?: number | undefined;
  badAccuracy?: number | undefined;
  stay?: boolean | undefined;
  idleMin?: number | undefined;
}

/** Adds what a real phone has: GPS noise, accuracy, speed, heading, battery, network. */
export function decorate(samples: readonly Sample[], cfg: SimConfig): Timed[] {
  const random = seeded(cfg.seed);
  const sigma = (cfg.noiseM ?? 8) / Math.SQRT2;
  return samples.map((s) => {
    const noisy = offsetM(s.at, gaussian(random, sigma), gaussian(random, sigma));
    const moving = s.heading !== null;
    return {
      tSec: s.tSec,
      truth: s.at,
      body: {
        id: randomUUID(),
        recordedAt: new Date(cfg.startMs + s.tSec * 1000).toISOString(),
        ...noisy,
        accuracyM: Math.round(6 + random() * 19),
        speedMps: moving
          ? Math.max(0, Math.round((s.speedMps + gaussian(random, 0.3)) * 10) / 10)
          : Math.round(random() * 4) / 10,
        headingDeg: moving ? Math.round(s.heading ?? 0) : null,
        altitudeM: Math.round(545 + gaussian(random, 2)),
        mocked: false,
        batteryPercent: Math.max(5, 88 - Math.floor(s.tSec / 600)),
        charging: false,
        network: 'cellular',
      },
    };
  });
}

const nearest = (points: readonly Timed[], minute: number): Timed | undefined =>
  points.reduce<Timed | undefined>(
    (best, p) =>
      !best || Math.abs(p.tSec - minute * 60) < Math.abs(best.tSec - minute * 60) ? p : best,
    undefined,
  );

/** The problem days: a gap, one fake point, one 20 km jump, one very poor accuracy. */
export function applyProblems(
  points: readonly Timed[],
  cfg: SimConfig,
): { points: Timed[]; dropped: number } {
  const [from, to] = cfg.gap ?? [0, 0];
  const kept = cfg.gap
    ? points.filter((p) => p.tSec < from * 60 || p.tSec >= to * 60)
    : [...points];
  const fake = cfg.fake === undefined ? undefined : nearest(kept, cfg.fake);
  if (fake) fake.body.mocked = true;
  const jump = cfg.jump === undefined ? undefined : nearest(kept, cfg.jump);
  if (jump) {
    const far = offsetM(jump.truth, 20_000, 0);
    jump.body.latitude = far.latitude;
    jump.body.longitude = far.longitude;
  }
  const poor = cfg.badAccuracy === undefined ? undefined : nearest(kept, cfg.badAccuracy);
  if (poor) poor.body.accuracyM = 300;
  return { points: kept, dropped: points.length - kept.length };
}

export interface Simulation {
  points: Timed[];
  dropped: number;
  totalSec: number;
  arriveSec: number;
  leaveSec: number;
  site: LatLng;
}

export function simulate(path: Path, cfg: SimConfig): Simulation {
  const m = motion(path, cfg.speedKmh, cfg.dwellMin, { stay: cfg.stay, idleMin: cfg.idleMin });
  const decorated = decorate(resample(m), cfg);
  const { points, dropped } = applyProblems(decorated, cfg);
  return {
    points,
    dropped,
    totalSec: m.totalSec,
    arriveSec: m.arriveSec,
    leaveSec: m.leaveSec,
    site: path.waypoints[path.siteIndex] as LatLng,
  };
}

/** Batches of at most 200, oldest first, as the phone uploads them. */
export function batches<T>(items: readonly T[], size = BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
