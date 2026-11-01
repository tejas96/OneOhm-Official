import type { CommandCenterQuery } from '@oneohm/api-contracts';
import { projects } from '@oneohm/database';
import { addDays } from '@oneohm/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';

export interface CenterScope {
  readonly today: string;
  /** First and last day of the period the flows (installed, collected, sales) cover. */
  readonly start: string;
  readonly end: string;
  /** Live projects, narrowed by manager and type when those filters are on. */
  readonly projects: SQL;
  readonly narrowed: boolean;
}

/** India's financial year starts in April; its quarters are Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar. */
function periodStart(period: CommandCenterQuery['period'], today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (period) {
    case 'last_30_days':
      return addDays(today, -29);
    case 'this_quarter': {
      const first = month - ((month - 1) % 3);
      return `${year}-${String(first).padStart(2, '0')}-01`;
    }
    case 'this_year':
      return month >= 4 ? `${year}-04-01` : `${year - 1}-04-01`;
    default:
      return `${today.slice(0, 8)}01`;
  }
}

export function centerScope(query: CommandCenterQuery, today: string): CenterScope {
  const live = inArray(projects.status, ['active', 'operational']);
  const filters = [
    query.managerUserId ? eq(projects.managerUserId, query.managerUserId) : undefined,
    query.projectType ? eq(projects.type, query.projectType) : undefined,
  ].filter((filter): filter is SQL => filter !== undefined);
  return {
    today,
    start: periodStart(query.period ?? 'this_month', today),
    end: today,
    projects: and(live, ...filters) ?? live,
    narrowed: filters.length > 0,
  };
}

/** The moment a calendar date starts in India. */
export const indiaStart = (date: string) => new Date(`${date}T00:00:00+05:30`);
