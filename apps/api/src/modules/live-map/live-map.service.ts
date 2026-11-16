import { Inject, Injectable } from '@nestjs/common';
import type { LiveSites, LiveTeam } from '@oneohm/api-contracts';
import { todayIn } from '@oneohm/shared';
import type { Actor } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { DATABASE, type Database } from '../../config/core.module';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import { watchedPeople } from '../workforce/duty-scope';
import { DayKmCache } from './live-km';
import { livePerson } from './live-person';
import { readDays, recentPoints, todaysVisits } from './live-read';
import { activeOffices, minutesInZone, teamSites } from './live-sites';

const byPerson = (visits: readonly VisitWithSite[]) => {
  const map = new Map<string, VisitWithSite[]>();
  for (const visit of visits)
    map.set(visit.row.userId, [...(map.get(visit.row.userId) ?? []), visit]);
  return map;
};

/**
 * The manager's live map (Duty Day step 4): the people the caller looks after (one scope
 * rule with the route reader, `watchedPeople`), and today's sites for them. The sites never
 * read route points; the team reads the last 30 minutes, and each day's km at most once a minute.
 */
@Injectable()
export class LiveMapService {
  private readonly km = new DayKmCache();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async base(actor: Actor) {
    const now = new Date();
    const { timeZone } = currentCalendar();
    const today = todayIn(timeZone, now);
    const people = await watchedPeople(this.db, actor);
    const ids = people.map((person) => person.id);
    const visits = await todaysVisits(this.db, ids, today);
    const sites = await teamSites(this.db, ids, today, minutesInZone(now, timeZone), visits);
    return { now, timeZone, today, people, ids, visits, sites };
  }

  async team(actor: Actor): Promise<LiveTeam> {
    const { now, timeZone, today, people, ids, visits, sites } = await this.base(actor);
    const { days, onLeave } = await readDays(this.db, ids, today);
    const reading = new Set(
      people.filter((person) => person.locationOn).map((person) => person.id),
    );
    const measured = [...days.values()].filter((day) => reading.has(day.userId));
    const open = measured.filter((day) => !day.checkOutAt);
    const [points, km] = await Promise.all([
      recentPoints(this.db, open, now, timeZone),
      this.km.get(this.db, measured, now, timeZone),
    ]);
    const visitsOf = byPerson(visits);
    return {
      generatedAt: now.toISOString(),
      people: people.map((person) => {
        const day = days.get(person.id) ?? null;
        return livePerson({
          person,
          now,
          day,
          recent: day ? (points.recent.get(day.id) ?? []) : [],
          latest: day ? (points.latest.get(day.id) ?? null) : null,
          km: day ? (km.get(day.id) ?? null) : null,
          onLeave: onLeave.has(person.id),
          visits: visitsOf.get(person.id) ?? [],
          siteIds: sites.byPerson.get(person.id) ?? new Set(),
        });
      }),
    };
  }

  async sites(actor: Actor): Promise<LiveSites> {
    const { sites } = await this.base(actor);
    return { sites: sites.sites, offices: await activeOffices(this.db) };
  }
}
