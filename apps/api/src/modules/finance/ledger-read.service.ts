import { Inject, Injectable } from '@nestjs/common';
import type { JournalEntry, TrialBalance } from '@oneohm/api-contracts';
import { journalEntries, journalLines, ledgerAccounts, projects, users } from '@oneohm/database';
import { debitNormal, type LedgerAccountCode } from '@oneohm/domain';
import { and, asc, desc, eq, inArray, isNotNull, lt, type SQL, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';

/** Account balance in its normal direction, from the ledger. */
export async function accountBalances(
  db: Database,
  codes?: readonly LedgerAccountCode[],
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      code: journalLines.accountCode,
      debit: sql<string>`coalesce(sum(${journalLines.debitPaise}), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.creditPaise}), 0)`,
    })
    .from(journalLines)
    .where(codes ? inArray(journalLines.accountCode, [...codes]) : undefined)
    .groupBy(journalLines.accountCode);
  return new Map(rows.map((row) => [row.code, Number(row.debit) - Number(row.credit)]));
}

/** The journal and the trial balance, read-only: entries are never edited. */
@Injectable()
export class LedgerReadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async journal(query: {
    before?: number | undefined;
    limit: number;
    projectId?: string | undefined;
  }): Promise<JournalEntry[]> {
    const filters: SQL[] = [];
    if (query.before) filters.push(lt(journalEntries.number, query.before));
    if (query.projectId) filters.push(eq(journalEntries.projectId, query.projectId));
    const entries = await this.db
      .select({
        entry: journalEntries,
        projectCode: projects.code,
        poster: { id: users.id, fullName: users.fullName },
      })
      .from(journalEntries)
      .leftJoin(projects, eq(projects.id, journalEntries.projectId))
      .leftJoin(users, eq(users.id, journalEntries.postedByUserId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(journalEntries.number))
      .limit(query.limit);
    if (entries.length === 0) return [];
    const ids = entries.map((row) => row.entry.id);
    const lines = await this.db
      .select({ line: journalLines, accountName: ledgerAccounts.name })
      .from(journalLines)
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.code, journalLines.accountCode))
      .where(inArray(journalLines.entryId, ids))
      .orderBy(asc(journalLines.position));
    const reversals = await this.db
      .select({ number: journalEntries.number, reverses: journalEntries.reversesEntryId })
      .from(journalEntries)
      .where(
        and(
          isNotNull(journalEntries.reversesEntryId),
          inArray(journalEntries.reversesEntryId, ids),
        ),
      );
    const reversedIds = entries.map((row) => row.entry.reversesEntryId).filter((id) => id !== null);
    const originals = reversedIds.length
      ? await this.db
          .select({ id: journalEntries.id, number: journalEntries.number })
          .from(journalEntries)
          .where(inArray(journalEntries.id, reversedIds))
      : [];
    return entries.map(({ entry, projectCode, poster }) => ({
      id: entry.id,
      number: entry.number,
      entryDate: entry.entryDate,
      memo: entry.memo,
      sourceType: entry.sourceType,
      projectCode,
      reversedByNumber: reversals.find((row) => row.reverses === entry.id)?.number ?? null,
      reversesNumber: originals.find((row) => row.id === entry.reversesEntryId)?.number ?? null,
      postedBy: poster?.id ? { id: poster.id, fullName: poster.fullName } : null,
      lines: lines
        .filter((row) => row.line.entryId === entry.id)
        .map((row) => ({
          accountCode: row.line.accountCode,
          accountName: row.accountName,
          debitPaise: row.line.debitPaise,
          creditPaise: row.line.creditPaise,
        })),
    }));
  }

  async trialBalance(): Promise<TrialBalance> {
    const accounts = await this.db.select().from(ledgerAccounts).orderBy(asc(ledgerAccounts.code));
    const sums = await this.db
      .select({
        code: journalLines.accountCode,
        debit: sql<string>`coalesce(sum(${journalLines.debitPaise}), 0)`,
        credit: sql<string>`coalesce(sum(${journalLines.creditPaise}), 0)`,
      })
      .from(journalLines)
      .groupBy(journalLines.accountCode);
    const [count] = await this.db.select({ entries: sql<string>`count(*)` }).from(journalEntries);
    const rows = accounts.map((account) => {
      const sum = sums.find((row) => row.code === account.code);
      const debitPaise = Number(sum?.debit ?? 0);
      const creditPaise = Number(sum?.credit ?? 0);
      const net = debitPaise - creditPaise;
      return {
        code: account.code,
        name: account.name,
        type: account.type,
        debitPaise,
        creditPaise,
        balancePaise: debitNormal(account.type) ? net : -net,
      };
    });
    const totalDebitPaise = rows.reduce((sum, row) => sum + row.debitPaise, 0);
    const totalCreditPaise = rows.reduce((sum, row) => sum + row.creditPaise, 0);
    return {
      accounts: rows,
      totalDebitPaise,
      totalCreditPaise,
      balanced: totalDebitPaise === totalCreditPaise,
      entries: Number(count?.entries ?? 0),
    };
  }
}
