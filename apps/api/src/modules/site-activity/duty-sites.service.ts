import { Inject, Injectable } from '@nestjs/common';
import type { DutySiteRecord } from '@oneohm/api-contracts';
import type { DatabaseExecutor } from '@oneohm/database';
import { selectDutySites } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { currentCalendar } from '../../common/calendar';
import { DATABASE, type Database } from '../../config/core.module';
import { openVisitOf } from '../service-visits/service-visit-read';
import { loadPolicy } from '../workforce/policy';
import { siteCandidates } from './site-candidates';

/**
 * The sites where the person has work on `today` and a saved pin, each with the fence radius
 * from Settings (Duty Day step 3). Empty when automatic visits are switched off. The phone
 * fences these and the route backstop reads the same list.
 */
export async function dutySitesFor(
  db: DatabaseExecutor,
  userId: string,
  today: string,
): Promise<DutySiteRecord[]> {
  const policy = await loadPolicy(db);
  if (!policy.travel.autoSiteVisits) return [];
  const candidates = await siteCandidates(db, [userId]);
  return selectDutySites(candidates, today, policy.travel.siteFenceM);
}

@Injectable()
export class DutySitesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The person's open visit anywhere, for the Today card; null when not checked in. */
  openVisit(userId: string) {
    return openVisitOf(this.db, userId);
  }

  forToday(userId: string): Promise<DutySiteRecord[]> {
    return dutySitesFor(this.db, userId, todayIn(currentCalendar().timeZone));
  }
}
