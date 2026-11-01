import { Inject, Injectable } from '@nestjs/common';
import type { EscalationPolicyRecord } from '@oneohm/api-contracts';
import { escalationPolicy } from '@oneohm/database';
import { checkEscalationPolicy, DEFAULT_ESCALATION } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/** When late or stuck work is raised, as set in Settings (PRD 3.7, 7.2). */
@Injectable()
export class EscalationPolicyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(): Promise<EscalationPolicyRecord> {
    const [row] = await this.db
      .select()
      .from(escalationPolicy)
      .where(eq(escalationPolicy.id, 'default'));
    if (!row) return DEFAULT_ESCALATION;
    return {
      managerAfterDays: row.managerAfterDays,
      ownersAfterDays: row.ownersAfterDays,
      stuckInternalDays: row.stuckInternalDays,
      stuckOutsideDays: row.stuckOutsideDays,
    };
  }

  async update(actor: Actor, input: EscalationPolicyRecord): Promise<EscalationPolicyRecord> {
    const errors = checkEscalationPolicy(input);
    if (Object.keys(errors).length > 0) throw invalid('Check the escalation days.', errors);
    const values = { ...input, updatedByUserId: actor.userId, updatedAt: new Date() };
    await this.db
      .insert(escalationPolicy)
      .values({ id: 'default', ...values })
      .onConflictDoUpdate({ target: escalationPolicy.id, set: values });
    await recordAudit(
      this.db,
      actor.userId,
      'settings.escalation_changed',
      'settings',
      'escalation',
      {
        ...input,
      },
    );
    return this.get();
  }
}
