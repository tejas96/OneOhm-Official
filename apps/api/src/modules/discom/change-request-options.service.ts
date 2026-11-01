import { Inject, Injectable } from '@nestjs/common';
import type { ChangeRequestOptions } from '@oneohm/api-contracts';
import { changeRequestTypes, ensureChangeRequestTypes } from '@oneohm/database';
import { changeRequestField } from '@oneohm/domain';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { papersOnFile, type RequestScope, requestSite } from './change-request-site';

/**
 * What the raise form offers for one site (PRD 3.15 step 1): its DISCOM's active change
 * types, each with only its own fields and the papers it needs, ticked when on file.
 */
@Injectable()
export class ChangeRequestOptionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async options(scope: RequestScope): Promise<ChangeRequestOptions> {
    const site = await requestSite(this.db, scope);
    const askDiscom = site.siteHasNoDiscom && !site.project;
    if (!site.discom) return { discom: null, askDiscom, options: [] };
    await ensureChangeRequestTypes(this.db, site.discom.id);
    const rows = await this.db
      .select()
      .from(changeRequestTypes)
      .where(
        and(eq(changeRequestTypes.discomId, site.discom.id), eq(changeRequestTypes.active, true)),
      )
      .orderBy(asc(changeRequestTypes.position), asc(changeRequestTypes.createdAt));
    const onFile = await papersOnFile(
      this.db,
      site,
      rows.flatMap((row) => row.documents),
    );
    return {
      discom: site.discom,
      askDiscom,
      options: rows.map((row) => ({
        key: row.key,
        title: row.title,
        description: row.description,
        fields: row.fields.map(changeRequestField).map((field) => ({
          ...field,
          options: field.kind === 'select' ? [...field.options] : undefined,
        })),
        documents: row.documents.map((category) => ({ category, onFile: onFile.has(category) })),
        steps: row.steps.length,
        holdsProjectWork: row.blocks.stages.length + row.blocks.taskKeys.length > 0,
      })),
    };
  }
}
