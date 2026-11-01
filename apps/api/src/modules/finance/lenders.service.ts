import { Inject, Injectable } from '@nestjs/common';
import type { LendingPartner } from '@oneohm/api-contracts';
import { lendingPartners } from '@oneohm/database';
import { checkPattern, type PatternPart } from '@oneohm/domain';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof lendingPartners.$inferSelect;
type Disbursement = 'single' | 'tranches';

export interface LenderInput {
  name: string;
  requiredDocuments: string[];
  disbursement: Disbursement;
  /** A parts lender's split in basis points; ignored (stored empty) for a single payment. */
  tranchePattern: PatternPart[];
  notes?: string | null | undefined;
  active: boolean;
}

const present = (row: Row): LendingPartner => ({
  id: row.id,
  name: row.name,
  requiredDocuments: row.requiredDocuments,
  disbursement: row.disbursement,
  tranchePattern: row.tranchePattern,
  notes: row.notes,
  active: row.active,
});

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/** What to store as the pattern: nothing for a single payment, else parts that make 100%. */
function patternToStore(disbursement: Disbursement, parts: readonly PatternPart[]): PatternPart[] {
  if (disbursement === 'single') return [];
  const problem = checkPattern(parts);
  if (problem) throw invalid(problem, { tranchePattern: problem });
  return parts.map((part) => ({ label: part.label.trim(), shareBp: part.shareBp }));
}

/** Banks and NBFCs OneOhm works with (PRD 3.11, 7.2): their documents and pattern. */
@Injectable()
export class LendersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<LendingPartner[]> {
    const rows = await this.db.select().from(lendingPartners).orderBy(asc(lendingPartners.name));
    return rows.map(present);
  }

  async create(actor: Actor, input: LenderInput): Promise<LendingPartner> {
    const tranchePattern = patternToStore(input.disbursement, input.tranchePattern);
    try {
      const [row] = await this.db
        .insert(lendingPartners)
        .values({ ...input, tranchePattern, notes: input.notes ?? null })
        .returning();
      if (!row) throw new Error('Lender insert returned nothing.');
      await recordAudit(this.db, actor.userId, 'lender.created', 'lending_partner', row.id);
      return present(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict(`${input.name} is already in the list.`);
      throw error;
    }
  }

  async update(actor: Actor, id: string, patch: Patch<LenderInput>): Promise<LendingPartner> {
    const pattern = await this.patternPatch(id, patch);
    try {
      const [row] = await this.db
        .update(lendingPartners)
        .set({ ...definedOnly(patch), ...pattern, updatedAt: new Date() })
        .where(eq(lendingPartners.id, id))
        .returning();
      if (!row) throw notFound('That lender');
      await recordAudit(this.db, actor.userId, 'lender.updated', 'lending_partner', id);
      return present(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Another lender already has that name.');
      throw error;
    }
  }

  /** The pattern an update stores, checked against the lender's kind after the update. */
  private async patternPatch(
    id: string,
    patch: Patch<LenderInput>,
  ): Promise<{ tranchePattern?: PatternPart[] }> {
    if (patch.disbursement === 'single') return { tranchePattern: [] };
    if (patch.tranchePattern === undefined) return {};
    let disbursement: Disbursement | undefined = patch.disbursement;
    if (!disbursement) {
      const [current] = await this.db
        .select({ disbursement: lendingPartners.disbursement })
        .from(lendingPartners)
        .where(eq(lendingPartners.id, id))
        .limit(1);
      if (!current) throw notFound('That lender');
      disbursement = current.disbursement;
    }
    return { tranchePattern: patternToStore(disbursement, patch.tranchePattern) };
  }
}
