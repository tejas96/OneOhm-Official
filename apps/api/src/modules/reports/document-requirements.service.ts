import { Inject, Injectable } from '@nestjs/common';
import type { DocumentRequirementInput, DocumentRequirementRecord } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documentRequirements } from '@oneohm/database';
import {
  builtInRequirements,
  type ConfiguredRequirement,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type RequirementConditions,
} from '@oneohm/domain';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

const isCategory = (value: string): value is DocumentCategory =>
  (DOCUMENT_CATEGORIES as readonly string[]).includes(value);

/** The owner's list of required papers; OneOhm's own list until it is seeded. */
export async function loadRequirements(db: DatabaseExecutor): Promise<ConfiguredRequirement[]> {
  const rows = await db
    .select()
    .from(documentRequirements)
    .orderBy(asc(documentRequirements.position));
  if (rows.length === 0) return builtInRequirements();
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    why: row.why,
    categories: row.categories.filter(isCategory),
    fromCustomer: row.fromCustomer,
    conditions: row.conditions as RequirementConditions,
    active: row.active,
    position: row.position,
    builtIn: row.builtIn,
    maxAgeDays: row.maxAgeDays,
  }));
}

const keyOf = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

/** Read-only rule arrays copied into the plain shape the API returns. */
function conditionsOut(rule: RequirementConditions): DocumentRequirementRecord['conditions'] {
  return {
    ...(rule.types ? { types: [...rule.types] } : {}),
    ...(rule.loan !== undefined ? { loan: rule.loan } : {}),
    ...(rule.subsidy !== undefined ? { subsidy: rule.subsidy } : {}),
    ...(rule.nameChange !== undefined ? { nameChange: rule.nameChange } : {}),
    ...(rule.discomCodes ? { discomCodes: [...rule.discomCodes] } : {}),
  };
}

const present = (requirement: ConfiguredRequirement): DocumentRequirementRecord => ({
  key: requirement.key,
  label: requirement.label,
  why: requirement.why,
  categories: [...requirement.categories],
  fromCustomer: requirement.fromCustomer ?? false,
  conditions: conditionsOut(requirement.conditions),
  active: requirement.active,
  position: requirement.position,
  builtIn: requirement.builtIn,
  maxAgeDays: requirement.maxAgeDays ?? null,
});

/** Settings → Required documents (PRD 3.14). Every change answers with the whole list. */
@Injectable()
export class DocumentRequirementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<DocumentRequirementRecord[]> {
    return (await loadRequirements(this.db)).map(present);
  }

  async create(
    actor: Actor,
    input: DocumentRequirementInput,
  ): Promise<DocumentRequirementRecord[]> {
    assertCan(actor, 'settings.manage');
    const key = keyOf(input.label);
    const last = await loadRequirements(this.db);
    const inserted = await this.db
      .insert(documentRequirements)
      .values({
        key,
        label: input.label.trim(),
        why: input.why?.trim() ?? '',
        categories: input.categories,
        fromCustomer: input.fromCustomer ?? false,
        conditions: input.conditions ?? {},
        maxAgeDays: input.maxAgeDays ?? null,
        position: Math.max(-1, ...last.map((item) => item.position)) + 1,
      })
      .onConflictDoNothing()
      .returning({ key: documentRequirements.key });
    if (inserted.length === 0) throw conflict('A paper with this name already exists.', 'exists');
    await recordAudit(
      this.db,
      actor.userId,
      'document_requirement.created',
      'document_requirement',
      key,
    );
    return this.list();
  }

  async update(
    actor: Actor,
    key: string,
    patch: {
      label?: string | undefined;
      why?: string | undefined;
      categories?: DocumentCategory[] | undefined;
      fromCustomer?: boolean | undefined;
      conditions?: DocumentRequirementRecord['conditions'] | undefined;
      maxAgeDays?: number | null | undefined;
      active?: boolean | undefined;
      move?: 'up' | 'down' | undefined;
    },
  ): Promise<DocumentRequirementRecord[]> {
    assertCan(actor, 'settings.manage');
    const all = await loadRequirements(this.db);
    const current = all.find((item) => item.key === key);
    if (!current) throw notFound('That paper');
    const { move, ...fields } = patch;
    await this.db.transaction(async (tx) => {
      if (Object.keys(fields).length > 0) {
        await tx
          .update(documentRequirements)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(documentRequirements.key, key));
      }
      const at = all.findIndex((item) => item.key === key);
      const other = move ? all[move === 'up' ? at - 1 : at + 1] : undefined;
      if (other) {
        await tx
          .update(documentRequirements)
          .set({ position: other.position })
          .where(eq(documentRequirements.key, key));
        await tx
          .update(documentRequirements)
          .set({ position: current.position })
          .where(eq(documentRequirements.key, other.key));
      }
      await recordAudit(
        tx,
        actor.userId,
        'document_requirement.updated',
        'document_requirement',
        key,
        patch,
      );
    });
    return this.list();
  }
}
