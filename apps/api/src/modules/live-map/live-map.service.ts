import { Inject, Injectable } from '@nestjs/common';
import type {
  DutyAlert,
  LiveSite,
  LiveSites,
  LiveTeam,
  NearestPeople,
} from '@oneohm/api-contracts';
import { todayIn } from '@oneohm/shared';
import { type Actor, assertCan } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { TasksService } from '../projects/tasks.service';
import { ServiceDeskService } from '../service-desk/service-desk.service';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import { watchedPeople } from '../workforce/duty-scope';
import { loadPolicy } from '../workforce/policy';
import { alertCounts, closeAlert, openAlerts, seeAlert } from './live-alerts';
import { DayKmCache } from './live-km';
import { nearestPeople } from './live-nearest';
import { livePerson } from './live-person';
import { readDays, recentPoints, todaysVisits } from './live-read';
import { siteInScope } from './live-site-lookup';
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

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tasks: TasksService,
    private readonly desk: ServiceDeskService,
  ) {}

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
    const [points, km, alerts] = await Promise.all([
      recentPoints(this.db, open, now, timeZone),
      this.km.get(this.db, measured, now, timeZone),
      alertCounts(this.db, ids),
    ]);
    const visitsOf = byPerson(visits);
    return {
      generatedAt: now.toISOString(),
      people: people.map((person) => {
        const day = days.get(person.id) ?? null;
        const entry = livePerson({
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
        return { ...entry, alerts: alerts.get(person.id) ?? { open: 0, red: 0 } };
      }),
    };
  }

  async sites(actor: Actor): Promise<LiveSites> {
    const { sites } = await this.base(actor);
    return { sites: sites.sites, offices: await activeOffices(this.db) };
  }

  /** Open duty alerts about the caller's people, newest first (Duty Day step 5). */
  alerts(actor: Actor): Promise<DutyAlert[]> {
    return openAlerts(this.db, actor);
  }

  seeAlert(actor: Actor, id: string): Promise<DutyAlert> {
    return seeAlert(this.db, actor, id);
  }

  resolveAlert(actor: Actor, id: string, reason: string | undefined): Promise<DutyAlert> {
    return closeAlert(this.db, actor, id, reason);
  }

  /**
   * A site on the caller's map today, else any site in their scope (`siteInScope`: one of
   * their people is assigned, in today's crew, or named by an alert about it), else not found.
   */
  private async siteOn(
    base: Awaited<ReturnType<LiveMapService['base']>>,
    siteId: string,
  ): Promise<LiveSite> {
    const onMap = base.sites.sites.find((one) => one.id === siteId);
    if (onMap) return onMap;
    const policy = await loadPolicy(this.db);
    const site = await siteInScope(this.db, {
      siteId,
      ids: base.ids,
      today: base.today,
      nowMin: minutesInZone(base.now, base.timeZone),
      radiusM: policy.travel.siteFenceM,
    });
    if (!site) throw notFound('That site');
    return site;
  }

  /** "Send nearest": free people the caller looks after, nearest the site first (`nearestPeople`). */
  async nearest(actor: Actor, siteId: string): Promise<NearestPeople> {
    const base = await this.base(actor);
    const { now, timeZone, today, people, ids, visits } = base;
    const site = await this.siteOn(base, siteId);
    const { days, onLeave } = await readDays(this.db, ids, today);
    const open = [...days.values()].filter((day) => !day.checkOutAt);
    const { latest } = await recentPoints(this.db, open, now, timeZone);
    return nearestPeople({ site, people, now, days, onLeave, latest, visits });
  }

  /**
   * Gives the site's task or service request to someone the caller looks after, through the
   * usual assignment (`TasksService.assign` with `tasks.assign`; a request with
   * `service.manage`): the same history, crew change and notice to the worker. The customer is
   * not messaged. Returns the site as the map now shows it.
   */
  async assign(actor: Actor, siteId: string, userId: string): Promise<LiveSite> {
    const base = await this.base(actor);
    const { people } = base;
    const site = await this.siteOn(base, siteId);
    if (!people.some((person) => person.id === userId))
      throw invalid('Pick someone you look after.', { userId: 'Not on your map.' });
    if (site.kind === 'service') {
      assertCan(actor, 'service.manage');
      await this.desk.update(
        actor.userId,
        siteId,
        { assigneeUserId: userId },
        { tellCustomer: false },
      );
    } else {
      await this.tasks.assign(actor, siteId, userId, { tellCustomer: false });
    }
    const after = await this.base(actor);
    const updated = after.sites.sites.find((one) => one.id === siteId);
    return updated ?? { ...site, assigneeIds: [userId] };
  }
}
