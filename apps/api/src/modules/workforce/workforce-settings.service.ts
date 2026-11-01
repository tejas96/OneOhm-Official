import { Inject, Injectable } from '@nestjs/common';
import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { workforcePolicy, workLocations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { loadLocations, loadPolicy } from './policy';

interface LocationInput {
  name?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  radiusM?: number | undefined;
  active?: boolean | undefined;
}

/** Leave allowances, working hours, places and point values (PRD 7.2). */
@Injectable()
export class WorkforceSettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get() {
    const [policy, locations] = await Promise.all([loadPolicy(this.db), loadLocations(this.db)]);
    return {
      // Plain arrays: the contract's shape, not the domain's read-only one.
      policy: {
        ...policy,
        leaveTypes: policy.leaveTypes.map((type) => ({ ...type })),
        weeklyOff: [...policy.weeklyOff],
      },
      locations: locations.map(({ id, name, latitude, longitude, radiusM, active }) => ({
        id,
        name,
        latitude,
        longitude,
        radiusM,
        active,
      })),
    };
  }

  async savePolicy(actor: Actor, policy: WorkforcePolicyInput) {
    const keys = policy.leaveTypes.map((type) => type.key);
    if (new Set(keys).size !== keys.length)
      throw invalid('Two kinds of leave share a short name.', {
        leaveTypes: 'Make each one unique.',
      });
    if (policy.attendance.dayEnd <= policy.attendance.dayStart)
      throw invalid('The day must end after it starts.', { dayEnd: 'Later than the start.' });
    await this.db.transaction(async (tx) => {
      await tx
        .insert(workforcePolicy)
        .values({ id: 'default', policy, updatedByUserId: actor.userId })
        .onConflictDoUpdate({
          target: workforcePolicy.id,
          set: { policy, updatedByUserId: actor.userId, updatedAt: new Date() },
        });
      await recordAudit(tx, actor.userId, 'workforce.policy_saved', 'settings', 'workforce', {
        ...policy,
      });
    });
    return this.get();
  }

  async addLocation(
    actor: Actor,
    input: { name: string; latitude: number; longitude: number; radiusM: number; active?: boolean },
  ) {
    await this.db.insert(workLocations).values({
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusM: input.radiusM,
      active: input.active ?? true,
    });
    await recordAudit(this.db, actor.userId, 'workforce.location_added', 'settings', 'workforce', {
      name: input.name,
    });
    return this.get();
  }

  async updateLocation(actor: Actor, id: string, input: LocationInput) {
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    const [updated] = await this.db
      .update(workLocations)
      .set(changes)
      .where(eq(workLocations.id, id))
      .returning({ id: workLocations.id });
    if (!updated) throw notFound('That place');
    await recordAudit(this.db, actor.userId, 'workforce.location_changed', 'settings', id, changes);
    return this.get();
  }
}
