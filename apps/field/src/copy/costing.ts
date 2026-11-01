/** English (India) copy for measuring cable runs on a survey (PRD 3.4, 3.9 A). */
export const CABLE_RUNS = {
  title: 'Cable runs by floor and route',
  body: 'Measure each run: metres across the roof or floor, metres up or down, and how many cables share it. The DC and AC lengths fill in from these.',
  kind: 'Route',
  kinds: { dc: 'DC', ac: 'AC', earth: 'Earthing' },
  floor: 'Floor',
  across: 'Across (m)',
  up: 'Up or down (m)',
  runs: 'Cables',
  add: 'Add a cable run',
  remove: 'Remove this run',
  totals: (dc: number, ac: number) => `Adds up to ${dc} m of DC and ${ac} m of AC cable.`,
} as const;
