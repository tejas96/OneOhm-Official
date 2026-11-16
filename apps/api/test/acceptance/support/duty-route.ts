// Route points a phone would record between Sangli and Miraj, for the Duty Day scenarios.
export const SANGLI = { latitude: 16.8524, longitude: 74.5815, accuracyM: 12 };
export const MIRAJ = { latitude: 16.8222, longitude: 74.6457, accuracyM: 15 };
export const WAY = { latitude: 16.87, longitude: 74.6 };
export const DETOUR = { latitude: 16.9, longitude: 74.63 };
const STEP_MIN = 5;
export const COUNT = 30;
let counter = 0;
const pointId = () =>
  `00000000-0000-4000-8000-${String(Date.now() % 1e9).padStart(9, '0')}${String(++counter).padStart(3, '0')}`;

/** Where the person is `fraction` of the way along Sangli, via `via`, to Miraj. */
function along(fraction: number, via: { latitude: number; longitude: number }) {
  const [from, to, share] =
    fraction < 0.5 ? [SANGLI, via, fraction * 2] : [via, MIRAJ, (fraction - 0.5) * 2];
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * share,
    longitude: from.longitude + (to.longitude - from.longitude) * share,
  };
}

export interface Plan {
  /** Indexes (0..29) of points the phone did not send. */
  readonly skip?: ReadonlySet<number>;
  readonly mocked?: ReadonlySet<number>;
  readonly via?: { latitude: number; longitude: number };
}

/** The route points a phone would have recorded: one every 5 minutes, ending 10 minutes ago. */
export function routePoints(plan: Plan, only?: ReadonlySet<number>) {
  const start = Date.now() - (COUNT * STEP_MIN + 10) * 60_000;
  return Array.from({ length: COUNT }, (_, index) => index)
    .filter((index) => !plan.skip?.has(index) && (!only || only.has(index)))
    .map((index) => ({
      id: pointId(),
      recordedAt: new Date(start + index * STEP_MIN * 60_000).toISOString(),
      ...along(index / (COUNT - 1), plan.via ?? WAY),
      accuracyM: 12,
      speedMps: 4,
      headingDeg: 90,
      altitudeM: null,
      mocked: plan.mocked?.has(index) ?? false,
      batteryPercent: 70,
      charging: false,
      network: 'cellular',
    }));
}
