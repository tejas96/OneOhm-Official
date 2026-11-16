import { type DatabaseExecutor, dutyPoints } from '@oneohm/database';
import { dutyWindowEnd, routeKm } from '@oneohm/domain';
import { and, asc, inArray, lte } from 'drizzle-orm';
import type { DayRow, PointRow } from './live-read';

/** A day's km is worked out again at most this often. */
export const KM_FRESH_MS = 60_000;

export interface DayKm {
  readonly km: number;
  readonly mockedToday: boolean;
}

interface Entry extends DayKm {
  readonly at: number;
  /** A day that ends (or resumes) is measured again at once. */
  readonly closed: boolean;
}

const roundKm = (metres: number) => Math.round(metres / 100) / 10;

/**
 * Km so far and the mocked flag per duty day, with the same rules as the travel claim
 * (`routeKm`). Each day is measured from its whole route at most once a minute; the days that
 * are due are read together in one query, so a 30-second refresh never reads every route.
 */
export class DayKmCache {
  private readonly entries = new Map<string, Entry>();

  async get(
    db: DatabaseExecutor,
    days: readonly DayRow[],
    now: Date,
    timeZone: string,
  ): Promise<Map<string, DayKm>> {
    const at = now.getTime();
    for (const [id, entry] of this.entries)
      if (at - entry.at > 10 * KM_FRESH_MS) this.entries.delete(id);
    const due = days.filter((day) => {
      const entry = this.entries.get(day.id);
      return !entry || at - entry.at >= KM_FRESH_MS || entry.closed !== Boolean(day.checkOutAt);
    });
    if (due.length > 0) {
      const cap = new Date(Math.max(...due.map((day) => dutyWindowEnd(day, now, timeZone))));
      const points = await db
        .select()
        .from(dutyPoints)
        .where(
          and(
            inArray(
              dutyPoints.attendanceDayId,
              due.map((day) => day.id),
            ),
            lte(dutyPoints.recordedAt, cap),
          ),
        )
        .orderBy(asc(dutyPoints.recordedAt), asc(dutyPoints.id));
      const byDay = new Map<string, PointRow[]>();
      for (const point of points)
        byDay.set(point.attendanceDayId, [...(byDay.get(point.attendanceDayId) ?? []), point]);
      for (const day of due) {
        const end = dutyWindowEnd(day, now, timeZone);
        const route = (byDay.get(day.id) ?? []).filter(
          (point) => point.recordedAt.getTime() <= end,
        );
        this.entries.set(day.id, {
          at,
          closed: Boolean(day.checkOutAt),
          km: roundKm(routeKm(route, { from: day.checkInAt, to: day.checkOutAt }).routeM),
          mockedToday: route.some((point) => point.mocked),
        });
      }
    }
    const out = new Map<string, DayKm>();
    for (const day of days) {
      const entry = this.entries.get(day.id);
      if (entry) out.set(day.id, { km: entry.km, mockedToday: entry.mockedToday });
    }
    return out;
  }
}
