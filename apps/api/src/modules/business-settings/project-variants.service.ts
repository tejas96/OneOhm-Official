import { Inject, Injectable } from '@nestjs/common';
import type { ProjectVariantInput, ProjectVariantRecord } from '@oneohm/api-contracts';
import { projects, projectVariants } from '@oneohm/database';
import {
  checkProjectVariant,
  DEFAULT_PROJECT_VARIANTS,
  type ProjectType,
  type ProjectVariant,
  projectVariantOf,
} from '@oneohm/domain';
import { asc, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/**
 * The kinds of project OneOhm builds (PRD 7.2 "project types"): owners rename and
 * describe them and switch off the ones not offered. A switched-off kind cannot start a
 * new project; projects already running carry on.
 */
@Injectable()
export class ProjectVariantsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<ProjectVariantRecord[]> {
    const rows = await this.db
      .select()
      .from(projectVariants)
      .orderBy(asc(projectVariants.position));
    const counts = await this.db
      .select({
        type: projects.type,
        groundMount: projects.groundMount,
        count: sql<number>`count(*)::int`,
      })
      .from(projects)
      .groupBy(projects.type, projects.groundMount);
    const used = new Map(
      counts.map((row) => [projectVariantOf(row.type as ProjectType, row.groundMount), row.count]),
    );
    // Shipped kinds missing from the table (before the seed ran) still show, switched on.
    return DEFAULT_PROJECT_VARIANTS.map((variant) => {
      const row = rows.find((entry) => entry.key === variant.key);
      return {
        key: variant.key,
        name: row?.name ?? variant.name,
        description: row?.description ?? variant.description,
        active: row?.active ?? true,
        projects: used.get(variant.key) ?? 0,
      };
    });
  }

  async save(
    actor: Actor,
    key: ProjectVariant,
    input: ProjectVariantInput,
  ): Promise<ProjectVariantRecord> {
    const errors = checkProjectVariant(input);
    if (Object.keys(errors).length > 0) throw invalid('Check the project type.', errors);
    const position = DEFAULT_PROJECT_VARIANTS.findIndex((variant) => variant.key === key);
    if (position < 0) throw notFound('That project type');
    const values = {
      name: input.name.trim(),
      description: input.description.trim(),
      active: input.active,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(projectVariants)
        .values({ key, position, ...values })
        .onConflictDoUpdate({ target: projectVariants.key, set: values });
      await recordAudit(tx, actor.userId, 'settings.project_type_changed', 'settings', key, {
        name: values.name,
        active: values.active,
      });
    });
    const saved = (await this.list()).find((variant) => variant.key === key);
    if (!saved) throw notFound('That project type');
    return saved;
  }
}
