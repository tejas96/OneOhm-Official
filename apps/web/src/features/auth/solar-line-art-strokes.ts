/**
 * The sign-in drawing as data: a two-storey home with a flat RCC roof and two
 * module tables (the common Maharashtra rooftop), its inverter, net meter and the
 * grid — the single-line path every OneOhm system follows. Strokes are listed in
 * the order they draw on.
 */
export interface Stroke {
  readonly d: string;
  /** Faint construction lines (floor line, sun path, irradiance). */
  readonly faint?: boolean;
  readonly dashed?: boolean;
}

const MODULE_WIDTH = 19;
const TABLE_TOP = 118;
const TABLE_BOTTOM = 146;

function moduleTable(left: number): string {
  const modules = Array.from({ length: 4 }, (_, index) => {
    const x = left + index * (MODULE_WIDTH + 1.5);
    return `M${x} ${TABLE_TOP} h${MODULE_WIDTH} V${TABLE_BOTTOM} h-${MODULE_WIDTH} Z`;
  });
  return modules.join(' ');
}

function moduleCells(left: number): string {
  const lines: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const x = left + index * (MODULE_WIDTH + 1.5);
    lines.push(`M${x + MODULE_WIDTH / 2} ${TABLE_TOP} V${TABLE_BOTTOM}`);
    for (const y of [125, 132, 139]) lines.push(`M${x} ${y} h${MODULE_WIDTH}`);
  }
  return lines.join(' ');
}

export const HOME_STROKES: readonly Stroke[] = [
  { d: 'M16 290 H508' },
  { d: 'M70 290 V170 H260 V290' },
  { d: 'M64 170 V161 H266 V170 Z' },
  { d: 'M70 230 H260', faint: true },
  { d: 'M92 186 h34 v26 h-34 Z M109 186 v26 M150 186 h34 v26 h-34 Z M167 186 v26' },
  { d: 'M208 186 h34 v26 h-34 Z M225 186 v26 M92 246 h34 v26 h-34 Z M109 246 v26' },
  { d: 'M196 244 h30 v46 M196 290 V244 M219 268 h3' },
  { d: 'M36 290 V276 M36 276 a15 15 0 1 1 0.1 0', faint: true },
];

export const ARRAY_STROKES: readonly Stroke[] = [
  { d: moduleTable(80) },
  { d: moduleTable(170) },
  { d: `${moduleCells(80)} ${moduleCells(170)}`, faint: true },
  {
    d: 'M86 146 V161 M154 146 V161 M176 146 V161 M244 146 V161 M86 154 L154 150 M176 154 L244 150',
  },
];

export const SUN_STROKES: readonly Stroke[] = [
  { d: 'M330 172 Q430 -32 530 172', faint: true, dashed: true },
  { d: 'M430 52 a18 18 0 1 1 -0.1 0' },
  {
    d: 'M430 34 V26 M430 114 V106 M392 70 H384 M476 70 H468 M403 43 L397 37 M457 97 L463 103 M457 43 L463 37 M403 97 L397 103',
  },
  { d: 'M410 84 L250 116 M414 90 L170 116', faint: true, dashed: true },
];

export const EQUIPMENT_STROKES: readonly Stroke[] = [
  { d: 'M268 196 H296 V234 H268 Z M274 202 h16 v8 h-16 Z M276 224 q3 -5 6 0 t6 0' },
  { d: 'M330 212 H356 V240 H330 Z M343 222 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M343 240 V290' },
  {
    d: 'M418 290 L436 168 M462 290 L444 168 M436 168 H444 M412 186 H468 M418 206 H462 M425 250 L455 222 M455 250 L425 222 M412 186 v7 M468 186 v7',
  },
];

/** Wires: DC from the array, AC to the meter, export to the grid. Current flows along these. */
export const WIRE_PATHS: readonly string[] = [
  'M252 140 H274 V196',
  'M296 218 H330',
  'M356 218 Q388 230 412 193',
];

/** Reference callouts, as on a drawing sheet: letter, circle centre, leader end. */
export const CALLOUTS: ReadonlyArray<{ letter: string; cx: number; cy: number; to: number }> = [
  { letter: 'A', cx: 166, cy: 96, to: 116 },
  { letter: 'B', cx: 282, cy: 176, to: 194 },
  { letter: 'C', cx: 343, cy: 192, to: 210 },
  { letter: 'D', cx: 440, cy: 146, to: 166 },
];
