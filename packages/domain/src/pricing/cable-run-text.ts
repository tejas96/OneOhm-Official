import type { CableRouteKind } from './costing-card';
import type { CableRunInput } from './costing-detail';

/** The survey fact holding cable runs measured floor by floor and route by route (PRD 3.4). */
export const CABLE_RUNS_FACT = 'cable_runs';

const KIND_WORDS: readonly [RegExp, CableRouteKind][] = [
  [/\bdc\b/i, 'dc'],
  [/\bac\b/i, 'ac'],
  [/\bearth/i, 'earth'],
];
const KIND_LABEL: Readonly<Record<CableRouteKind, string>> = { dc: 'DC', ac: 'AC', earth: 'Earth' };

const numberBefore = (text: string, words: string): number | null => {
  const match = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*m?\\s*(?:${words})\\b`, 'i').exec(text);
  return match?.[1] ? Number.parseFloat(match[1]) : null;
};

/** One run as the survey writes it: "DC · floor 2 · 12 m across · 6 m up · 2 runs". */
export function cableRunText(run: CableRunInput): string {
  return [
    KIND_LABEL[run.kind],
    ...(run.floor === null || run.floor === undefined ? [] : [`floor ${run.floor}`]),
    `${run.acrossM} m across`,
    `${run.upM} m up`,
    `${run.runs} ${run.runs === 1 ? 'run' : 'runs'}`,
  ].join(' · ');
}

/** Runs as one fact value, a line each. */
export function formatCableRuns(runs: readonly CableRunInput[]): string {
  return runs.map(cableRunText).join('\n');
}

/**
 * Reads the cable runs a survey recorded, one per line: the kind (DC, AC or earth), the
 * floor, metres across and up, and the number of runs (1 when not said). Lines it cannot
 * read are returned so the person can correct them.
 */
export function parseCableRuns(text: string): {
  readonly runs: CableRunInput[];
  readonly unreadable: string[];
} {
  const runs: CableRunInput[] = [];
  const unreadable: string[] = [];
  for (const raw of text.split(/[\n;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const kind = KIND_WORDS.find(([pattern]) => pattern.test(line))?.[1];
    const acrossM = numberBefore(line, 'across|horizontal|along') ?? 0;
    const upM = numberBefore(line, 'up|down|vertical|drop') ?? 0;
    if (!kind || acrossM + upM <= 0) {
      unreadable.push(line);
      continue;
    }
    const floor = /floor\s*(\d+)/i.exec(line)?.[1];
    const count = /(\d+)\s*(?:runs?|cables?)\b/i.exec(line)?.[1];
    runs.push({
      kind,
      floor: floor === undefined ? null : Number.parseInt(floor, 10),
      acrossM,
      upM,
      runs: Math.max(1, count === undefined ? 1 : Number.parseInt(count, 10)),
    });
  }
  return { runs, unreadable };
}

/** Total cable of a kind the runs need, before wastage: what the survey's DC and AC fields hold. */
export function cableTotal(runs: readonly CableRunInput[], kind: CableRouteKind): number {
  const total = runs
    .filter((run) => run.kind === kind)
    .reduce((sum, run) => sum + (run.acrossM + run.upM) * run.runs, 0);
  return Math.round(total * 100) / 100;
}
