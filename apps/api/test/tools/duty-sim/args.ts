/** Command-line flags of the duty-day simulator, parsed without any library. */
export interface Args {
  api: string | undefined;
  setup: boolean;
  worker: string | undefined;
  route: string | undefined;
  gpx: string | undefined;
  kml: string | undefined;
  geojson: string | undefined;
  siteIndex: number | undefined;
  speed: number;
  dwell: number;
  fence: boolean;
  gap: [number, number] | undefined;
  fake: number | undefined;
  jump: number | undefined;
  badAccuracy: number | undefined;
  approveRun: boolean;
  seed: number | undefined;
  /** The worker's base (home) saved at setup; null means the first waypoint. */
  base: { latitude: number; longitude: number } | null;
  /** Keep duty open and end the trip about now, for the live map (no claim report). */
  live: boolean;
  /** Stay at the site to the end of the trip (an open visit with --live). */
  stay: boolean;
  /** Minutes standing still after the trip (idle with --live). */
  idle: number;
  /** Minutes of silence before now: the trip ends this long ago (a gap with --live). */
  quiet: number;
  /** The worker's name instead of `Sim Worker <time>`. */
  name: string | undefined;
  /** Phone of the worker's reporting manager, set at setup. */
  manager: string | undefined;
  help: boolean;
}

const BOOLEANS = new Set(['setup', 'no-setup', 'fence', 'approve-run', 'live', 'stay', 'help']);
const VALUES = new Set([
  'api',
  'worker',
  'route',
  'gpx',
  'kml',
  'geojson',
  'site-index',
  'speed',
  'dwell',
  'gap',
  'fake',
  'jump',
  'bad-accuracy',
  'seed',
  'base',
  'idle',
  'quiet',
  'name',
  'manager',
]);

function num(name: string, text: string | undefined, min = 0): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min)
    throw new Error(`--${name} needs a number, got "${text}".`);
  return value;
}

function range(text: string | undefined): [number, number] | undefined {
  if (text === undefined) return undefined;
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(text);
  const from = Number(match?.[1]);
  const to = Number(match?.[2]);
  if (!match || to <= from) throw new Error(`--gap needs "<from>-<to>" minutes, got "${text}".`);
  return [from, to];
}

function point(text: string | undefined): Args['base'] {
  if (text === undefined) return null;
  const [latitude, longitude, extra] = text.split(',').map((part) => Number(part.trim()));
  if (
    latitude === undefined ||
    longitude === undefined ||
    extra !== undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new Error(`--base needs "lat,lng", got "${text}".`);
  return { latitude, longitude };
}

export function parseArgs(argv: readonly string[]): Args {
  const seen = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i] ?? '';
    if (!raw.startsWith('--')) throw new Error(`Unexpected argument "${raw}". See README.md.`);
    const [name = '', inline] = raw.slice(2).split(/=(.*)/s);
    if (BOOLEANS.has(name)) {
      flags.add(name);
    } else if (VALUES.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`--${name} needs a value.`);
      seen.set(name, value);
    } else {
      throw new Error(`Unknown flag --${name}. See README.md.`);
    }
  }
  return {
    api: seen.get('api'),
    setup: !flags.has('no-setup'),
    worker: seen.get('worker'),
    route: seen.get('route'),
    gpx: seen.get('gpx'),
    kml: seen.get('kml'),
    geojson: seen.get('geojson'),
    siteIndex: num('site-index', seen.get('site-index')),
    speed: num('speed', seen.get('speed'), 1) ?? 25,
    dwell: num('dwell', seen.get('dwell')) ?? 12,
    fence: flags.has('fence'),
    gap: range(seen.get('gap')),
    fake: num('fake', seen.get('fake')),
    jump: num('jump', seen.get('jump')),
    badAccuracy: num('bad-accuracy', seen.get('bad-accuracy')),
    approveRun: flags.has('approve-run'),
    seed: num('seed', seen.get('seed')),
    base: point(seen.get('base')),
    live: flags.has('live'),
    stay: flags.has('stay'),
    idle: num('idle', seen.get('idle')) ?? 0,
    quiet: num('quiet', seen.get('quiet')) ?? 0,
    name: seen.get('name')?.trim() || undefined,
    manager: seen.get('manager'),
    help: flags.has('help'),
  };
}
