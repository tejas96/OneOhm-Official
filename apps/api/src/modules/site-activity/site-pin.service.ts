import { Inject, Injectable } from '@nestjs/common';
import { properties, siteVisits } from '@oneohm/database';
import { distanceMeters, type GeoPoint, judgeSitePin, siteDistance } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { loadPolicy } from '../workforce/policy';
import type { SiteTask } from './site-task';
import { noteSiteSaved } from './site-visit-events';
import { checkInPoint } from './site-visit-read';

type VisitRow = typeof siteVisits.$inferSelect;

/**
 * The roof the worker pinned on the map during an open site visit (design 6.2). The pin
 * is compared with the check-in reading the server already holds, never one sent with
 * it: within the trust limit it is saved as is; farther, or with no reading, it is still
 * saved and flagged for the office. The point it replaces is kept so it can be put back.
 */
@Injectable()
export class SitePinService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async pin(actor: Actor, task: SiteTask, open: VisitRow, pin: GeoPoint): Promise<void> {
    const policy = await loadPolicy(this.db);
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ latitude: properties.latitude, longitude: properties.longitude })
        .from(properties)
        .where(eq(properties.id, task.propertyId))
        .for('update');
      if (!current) throw notFound('That site');
      const previous =
        current.latitude !== null && current.longitude !== null
          ? { latitude: current.latitude, longitude: current.longitude }
          : null;
      // A second tap on the same spot changes nothing.
      // The same pin sent twice: within 0.5 m (distanceMeters rounds to whole metres).
      if (previous && distanceMeters(previous, pin) < 1) return;
      const point = checkInPoint(open);
      const reading = point ? { ...point, accuracyM: open.checkInAccuracyM } : null;
      const judged = judgeSitePin(pin, reading, policy.travel.pinTrustM);
      const now = new Date();
      await tx
        .update(properties)
        .set({
          latitude: pin.latitude,
          longitude: pin.longitude,
          locationSource: 'map_pin',
          locationAccuracyM: null,
          locatedAt: now,
          locatedByUserId: actor.userId,
          locationFlagged: judged.flagged,
          locationFlagDistanceM: judged.distanceM,
          ...(previous
            ? { previousLatitude: previous.latitude, previousLongitude: previous.longitude }
            : {}),
          updatedAt: now,
        })
        .where(eq(properties.id, task.propertyId));
      // The open visit is measured again against the new pin; history keeps the old line.
      const measured = reading ? siteDistance(reading, pin, policy.travel.farFromSiteM) : null;
      if (measured) {
        await tx
          .update(siteVisits)
          .set({ checkInDistanceM: measured.distanceM, checkInFar: measured.far, updatedAt: now })
          .where(eq(siteVisits.id, open.id));
      }
      await recordAudit(tx, actor.userId, 'property.located', 'property', task.propertyId, {
        source: 'map_pin',
        fromVisit: open.id,
        distanceFromReadingM: judged.distanceM,
        flagged: judged.flagged,
        previous,
      });
      await noteSiteSaved(tx, task, actor.userId);
    });
  }
}
