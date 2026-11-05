/** Query keys for attendance, leave and points; prefixes let one change refresh its neighbours. */
export const WORKFORCE_KEYS = {
  attendance: ['attendance'],
  teamDay: (date: string) => ['attendance', 'team', date] as const,
  corrections: ['attendance', 'corrections', 'pending'],
  leave: ['leave'],
  allLeave: ['leave', 'all'],
  myLeave: ['leave', 'mine'],
  workday: ['me', 'workday'],
  points: ['points'],
  standings: ['points', 'standings'],
  pointsList: ['points', 'list'],
  pendingPoints: ['points', 'pending'],
} as const;
