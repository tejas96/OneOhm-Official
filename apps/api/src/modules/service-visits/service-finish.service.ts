import { Inject, Injectable } from '@nestjs/common';
import type { ServiceFinishInput, ServiceVisit } from '@oneohm/api-contracts';
import { serviceRequests, serviceVisitReports } from '@oneohm/database';
import { finishChanges, finishProblems } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { noteHandedBack, tellCustomer } from './service-visit-events';
import { ServiceVisitsService } from './service-visits.service';

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Finishing a service visit (PRD 5.5): the technician writes what they found and did,
 * then marks the work done (the request is resolved and the customer told) or hands it
 * back to the desk with a reason. Still checked in, they are checked out first.
 */
@Injectable()
export class ServiceFinishService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly visits: ServiceVisitsService,
  ) {}

  async finish(actor: Actor, id: string, input: ServiceFinishInput): Promise<ServiceVisit> {
    const problems = finishProblems(input);
    if (Object.keys(problems).length > 0) throw invalid('Some details need fixing.', problems);
    const job = await this.visits.ownJob(actor, id);
    const visitId = await this.visits.closeVisit(actor, job, input.position);
    const now = new Date();
    const changes = finishChanges(job.request, input, now);
    const reason = clean(input.reason);
    await this.db.transaction(async (tx) => {
      await tx
        .update(serviceRequests)
        .set({ ...changes, updatedAt: now })
        .where(eq(serviceRequests.id, id));
      await tx.insert(serviceVisitReports).values({
        serviceRequestId: id,
        siteVisitId: visitId,
        userId: actor.userId,
        outcome: input.outcome,
        found: clean(input.found),
        workDone: clean(input.workDone),
        reason: input.outcome === 'handed_back' ? reason : null,
      });
      if (input.outcome === 'done') {
        await tellCustomer(tx, job, 'resolved', now);
        await recordAudit(tx, actor.userId, 'service.resolved', 'service_request', id, {
          from: 'field',
          visitId,
        });
      } else {
        await noteHandedBack(tx, job.ticket, actor, reason ?? '', now);
        await recordAudit(tx, actor.userId, 'service.handed_back', 'service_request', id, {
          reason,
          visitId,
        });
      }
    });
    return this.visits.detail(actor, id, true);
  }
}
