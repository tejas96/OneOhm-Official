import { Inject, Injectable } from '@nestjs/common';
import type { DocumentRequest } from '@oneohm/api-contracts';
import { customerActions } from '@oneohm/database';
import { nextActionStatus } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { logAction } from '../documents/customer-action-log';
import { readRequests } from '../documents/document-request-read';
import { lockedPoint, savePin } from './apply-pin';

/**
 * "Check location" (redesign §6): a pin the customer sent for a home that already has a point
 * waits as a suggestion. The team accepts it (it becomes the home's point, the earlier one kept
 * to put back) or ignores it (the home keeps its point). Either way the action closes.
 */
@Injectable()
export class LocationReviewService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  accept(actor: Actor, id: string): Promise<DocumentRequest> {
    return this.settle(actor, id, true);
  }

  ignore(actor: Actor, id: string): Promise<DocumentRequest> {
    return this.settle(actor, id, false);
  }

  private async settle(actor: Actor, id: string, accept: boolean): Promise<DocumentRequest> {
    if (!can(actor, 'customers.manage') && !can(actor, 'projects.manage')) throw forbidden();
    await this.db.transaction(async (tx) => {
      const [action] = await tx
        .select()
        .from(customerActions)
        .where(and(eq(customerActions.id, id), eq(customerActions.type, 'location')))
        .for('update');
      if (!action) throw notFound('That location');
      if (!nextActionStatus('location', action.status, 'looks_good')) {
        throw conflict('There is no location waiting to be checked.', 'not_received');
      }
      const pin = action.payload.pin as { latitude?: number; longitude?: number } | undefined;
      if (
        !action.propertyId ||
        typeof pin?.latitude !== 'number' ||
        typeof pin.longitude !== 'number'
      ) {
        throw conflict('This location has no home or point.', 'no_pin');
      }
      if (accept) {
        const previous = await lockedPoint(tx, action.propertyId);
        await savePin(
          tx,
          action.propertyId,
          { latitude: pin.latitude, longitude: pin.longitude },
          previous,
          actor.userId,
          'accepted',
        );
      }
      await tx
        .update(customerActions)
        .set({
          status: 'closed',
          closedAt: new Date(),
          updatedAt: new Date(),
          payload: { ...action.payload, decision: accept ? 'accepted' : 'ignored' },
        })
        .where(eq(customerActions.id, id));
      await logAction(tx, action, {
        kind: 'customer_action',
        message: accept
          ? "Used the location the customer sent as the home's location"
          : 'Kept the home location; ignored the pin the customer sent',
        userId: actor.userId,
        data: { customerActionId: id },
      });
      await recordAudit(
        tx,
        actor.userId,
        accept ? 'customer_action.location_accepted' : 'customer_action.location_ignored',
        'customer_action',
        id,
      );
    });
    const [updated] = await readRequests(this.db, eq(customerActions.id, id), true);
    if (!updated) throw notFound('That location');
    return updated;
  }
}
