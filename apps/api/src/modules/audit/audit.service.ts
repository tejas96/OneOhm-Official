import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry, Page, SignInAttempt } from '@oneohm/api-contracts';
import { auditLog, signInAttempts, users } from '@oneohm/database';
import { and, count, desc, eq, ilike, lt, or, type SQL, sql } from 'drizzle-orm';
import { likeTerm, offsetOf, pageFrom } from '../../common/paging';
import { DATABASE, type Database } from '../../config/core.module';
import { actionPattern } from './audit-search';

const PAGE = 50;

/**
 * Rows after the last one shown, by its exact time and id. Many entries of one change
 * share a time (one transaction), so the time alone would skip some at a page edge.
 */
function afterCursor(cursor: string | undefined): SQL | undefined {
  const [at, id] = cursor?.split('|') ?? [];
  if (!at || !id || !/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return sql`(${auditLog.createdAt}, ${auditLog.id}) < (${at}::timestamptz, ${id}::uuid)`;
}

/** Reads the audit trail and the sign-in attempts; nothing here writes. */
@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async activity(query: {
    entity?: string | undefined;
    search?: string | undefined;
    before?: string | undefined;
    cursor?: string | undefined;
  }): Promise<{ items: AuditEntry[]; next: string | null; cursor: string | null }> {
    const filters: (SQL | undefined)[] = [
      query.entity ? eq(auditLog.entity, query.entity) : undefined,
      query.before ? lt(auditLog.createdAt, new Date(query.before)) : undefined,
      afterCursor(query.cursor),
      query.search
        ? or(
            ilike(auditLog.action, actionPattern(query.search)),
            ilike(auditLog.entityId, likeTerm(query.search)),
            ilike(users.fullName, likeTerm(query.search)),
          )
        : undefined,
    ];
    const rows = await this.db
      .select({
        entry: auditLog,
        name: users.fullName,
        exactAt: sql<string>`${auditLog.createdAt}::text`,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(and(...filters))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
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
    const lastRow = rows[PAGE - 1];
    return {
      items,
      next: rows.length > PAGE && last ? last.at : null,
      cursor: rows.length > PAGE && lastRow ? `${lastRow.exactAt}|${lastRow.entry.id}` : null,
    };
  }

  /** Sign-in tries, newest first, a page at a time; search matches account, name or address. */
  async signIns(query: {
    failedOnly: boolean;
    search?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  }): Promise<Page<SignInAttempt>> {
    const where = and(
      query.failedOnly ? eq(signInAttempts.success, false) : undefined,
      query.search
        ? or(
            ilike(signInAttempts.identifier, likeTerm(query.search)),
            ilike(users.fullName, likeTerm(query.search)),
            ilike(signInAttempts.ip, likeTerm(query.search)),
          )
        : undefined,
    );
    const offset = offsetOf(query);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ attempt: signInAttempts, name: users.fullName })
        .from(signInAttempts)
        .leftJoin(users, eq(users.id, signInAttempts.userId))
        .where(where)
        .orderBy(desc(signInAttempts.createdAt), desc(signInAttempts.id))
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(signInAttempts)
        .leftJoin(users, eq(users.id, signInAttempts.userId))
        .where(where),
    ]);
    const items = rows.map(({ attempt, name }) => ({
      id: attempt.id,
      at: attempt.createdAt.toISOString(),
      identifier: attempt.identifier,
      method: attempt.method,
      ip: attempt.ip,
      user: attempt.userId && name ? { id: attempt.userId, name } : null,
      success: attempt.success,
    }));
    return pageFrom(items, total?.value ?? 0, offset, query.limit);
  }
}
