import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry, SignInAttempt } from '@oneohm/api-contracts';
import { auditLog, signInAttempts, users } from '@oneohm/database';
import { and, desc, eq, ilike, lt, or, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';

const PAGE = 50;

/** Reads the audit trail and the sign-in attempts; nothing here writes. */
@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async activity(query: {
    entity?: string | undefined;
    search?: string | undefined;
    before?: string | undefined;
  }): Promise<{ items: AuditEntry[]; next: string | null }> {
    const filters: (SQL | undefined)[] = [
      query.entity ? eq(auditLog.entity, query.entity) : undefined,
      query.before ? lt(auditLog.createdAt, new Date(query.before)) : undefined,
      query.search
        ? or(
            ilike(auditLog.action, `%${query.search}%`),
            ilike(auditLog.entityId, `%${query.search}%`),
            ilike(users.fullName, `%${query.search}%`),
          )
        : undefined,
    ];
    const rows = await this.db
      .select({ entry: auditLog, name: users.fullName })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(and(...filters))
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE + 1);
    const items = rows.slice(0, PAGE).map(({ entry, name }) => ({
      id: entry.id,
      at: entry.createdAt.toISOString(),
      actor: entry.actorUserId && name ? { id: entry.actorUserId, name } : null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      data: (entry.data as Record<string, unknown> | null) ?? null,
    }));
    const last = items.at(-1);
    return { items, next: rows.length > PAGE && last ? last.at : null };
  }

  async signIns(failedOnly: boolean): Promise<SignInAttempt[]> {
    const rows = await this.db
      .select({ attempt: signInAttempts, name: users.fullName })
      .from(signInAttempts)
      .leftJoin(users, eq(users.id, signInAttempts.userId))
      .where(failedOnly ? eq(signInAttempts.success, false) : undefined)
      .orderBy(desc(signInAttempts.createdAt))
      .limit(100);
    return rows.map(({ attempt, name }) => ({
      id: attempt.id,
      at: attempt.createdAt.toISOString(),
      identifier: attempt.identifier,
      method: attempt.method,
      ip: attempt.ip,
      user: attempt.userId && name ? { id: attempt.userId, name } : null,
      success: attempt.success,
    }));
  }
}
