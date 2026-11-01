import { Inject, Injectable } from '@nestjs/common';
import type { LendingPartner } from '@oneohm/api-contracts';
import { lendingPartners } from '@oneohm/database';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';
import { DATABASE, type Database } from '../../config/core.module';

type Row = typeof lendingPartners.$inferSelect;

export interface LenderInput {
  name: string;
  requiredDocuments: string[];
  disbursement: 'single' | 'tranches';
  notes?: string | null | undefined;
  active: boolean;
}

const present = (row: Row): LendingPartner => ({
  id: row.id,
  name: row.name,
  requiredDocuments: row.requiredDocuments,
  disbursement: row.disbursement,
  notes: row.notes,
  active: row.active,
});

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

/** Banks and NBFCs OneOhm works with (PRD 3.11, 7.2): their documents and pattern. */
@Injectable()
export class LendersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<LendingPartner[]> {
    const rows = await this.db.select().from(lendingPartners).orderBy(asc(lendingPartners.name));
    return rows.map(present);
  }

  async create(actor: Actor, input: LenderInput): Promise<LendingPartner> {
    try {
      const [row] = await this.db
        .insert(lendingPartners)
        .values({ ...input, notes: input.notes ?? null })
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
    try {
      const [row] = await this.db
        .update(lendingPartners)
        .set({ ...definedOnly(patch), updatedAt: new Date() })
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
}
