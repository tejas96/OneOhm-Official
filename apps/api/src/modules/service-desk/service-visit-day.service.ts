import { Inject, Injectable } from '@nestjs/common';
import type { ServiceTicket } from '@oneohm/api-contracts';
import { serviceRequests } from '@oneohm/database';
import { visitDayProblem } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { setServiceDay } from '../visits/service-day';

/**
 * The day the technician visits a customer's request (PRD 5.5). It is kept on the visit record
 * (redesign §8); booking or moving it tells the customer (WhatsApp, else SMS, else on paper, and in
 * the app), and saving the same day again sends nothing.
 */
@Injectable()
export class ServiceVisitDayService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  private async row(id: string) {
    const [row] = await serviceRequestRows(this.db, eq(serviceRequests.id, id));
    if (!row) throw notFound('That service request');
    return row;
  }

  async set(actorId: string, id: string, visitOn: string | null): Promise<ServiceTicket> {
    const current = await this.row(id);
    const before = current.request.visitOn;
    const problem = visitDayProblem(current.request.status, visitOn, todayIn());
    if (problem === 'resolved') throw conflict('This request is already resolved.', 'resolved');
    if (problem === 'past')
      throw invalid('Pick today or a later day.', { visitOn: 'This day has passed.' });
    if (before !== visitOn) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(serviceRequests)
          .set({ visitOn, updatedAt: new Date() })
          .where(eq(serviceRequests.id, id));
        // The day lives on the visit record; the customer hears it once, with [Okay] [Change day].
        await setServiceDay(tx, actorId, id, visitOn, this.env.BUSINESS_TIMEZONE);
        await recordAudit(
          tx,
          actorId,
          visitOn ? 'service.visit_booked' : 'service.visit_cleared',
          'service_request',
          id,
          { from: before, to: visitOn },
        );
      });
    }
    return toTicket(await this.row(id), new Date());
  }
}
