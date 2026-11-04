import { Inject, Injectable } from '@nestjs/common';
import type { Person } from '@oneohm/api-contracts';
import { roles, type Transaction, userRoles, users } from '@oneohm/database';
import type { RoleKind } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import type { Actor } from '../../../common/auth/actor';
import { conflict, notFound } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { readPeople } from '../people-read';
import { assertKeepsASuperAdmin } from '../super-admin-guard';
import { tellCustomers } from './departure-customers';
import { handOver } from './departure-handover';
import { checkRemoval, type RemovalProblem } from './departure-rules';
import { countsOf } from './departure-summary';
import { openWork } from './departure-work';
import { wrapUp } from './departure-wrapup';

export interface Removal {
  readonly handToUserId: string;
  readonly lastWorkingDay: string;
  /** On: each customer of the leaver is told their new contact, once. */
  readonly tellCustomers: boolean;
}

const PROBLEMS: Record<RemovalProblem, string> = {
  remove_self: 'You cannot remove yourself. Ask another admin to do it.',
  target_is_leaver: 'The work cannot go to the person who is leaving. Pick someone else.',
  target_not_active: 'That person is no longer on the team. Pick someone else.',
  target_is_reseller: 'Work cannot go to a reseller. Pick someone else.',
  future_date: 'The last working day is today or earlier. Remove them on the day they leave.',
};

/** Both people's rows, locked in id order so two removals at once never deadlock. */
async function lockBoth(tx: Transaction, leaverId: string, targetId: string) {
  const rows = await tx
    .select({
      id: users.id,
      fullName: users.fullName,
      phoneE164: users.phoneE164,
      status: users.status,
    })
    .from(users)
    .where(inArray(users.id, [leaverId, targetId]))
    .orderBy(asc(users.id))
    .for('update');
  return {
    leaver: rows.find((row) => row.id === leaverId),
    target: rows.find((row) => row.id === targetId),
  };
}

async function kindsOf(tx: Transaction, userId: string): Promise<RoleKind[]> {
  const rows = await tx
    .select({ kind: roles.kind })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.kind as RoleKind);
}

@Injectable()
export class DepartureService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  /** Remove from team (spec Flow 5): hand over, wrap up and switch off, in one step. */
  async remove(actor: Actor, id: string, input: Removal): Promise<Person> {
    await this.db.transaction(async (tx) => {
      const { leaver, target } = await lockBoth(tx, id, input.handToUserId);
      if (!leaver) throw notFound('That person');
      // A second submit must not write another audit entry or move the leaving date.
      if (leaver.status !== 'active')
        throw conflict('This person has already left the team.', 'already_removed');
      const problem = checkRemoval({
        actorId: actor.userId,
        leaverId: id,
        target: target ? { ...target, kinds: await kindsOf(tx, target.id) } : null,
        lastWorkingDay: input.lastWorkingDay,
        today: todayIn(),
      });
      if (problem) throw conflict(PROBLEMS[problem], problem);
      if (!target) throw notFound('That person');
      await assertKeepsASuperAdmin(tx, id, undefined, 'inactive');
      const work = await openWork(tx, id);
      const now = new Date();
      await handOver(tx, actor.userId, leaver, target, work);
      if (input.tellCustomers) await tellCustomers(tx, id, target, work);
      await wrapUp(tx, id, now);
      await tx
        .update(users)
        .set({ status: 'inactive', leftOn: input.lastWorkingDay, updatedAt: now })
        .where(eq(users.id, id));
      await recordAudit(tx, actor.userId, 'person.removed', 'user', id, {
        handTo: target.id,
        counts: countsOf(work),
      });
    });
    const person = (await readPeople(this.db, this.env)).find((entry) => entry.id === id);
    if (!person) throw notFound('That person');
    return person;
  }
}
