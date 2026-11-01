import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { discomReportTemplates, discoms, reportSettings } from '@oneohm/database';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import {
  BUILT_IN_REPORTS,
  builtInTemplate,
  definitionOf,
  type ReportDefinition,
} from './report-definitions';

type FormatRow = typeof discomReportTemplates.$inferSelect;

/** A stored format as the report services read it. */
export const formatDefinition = (row: FormatRow): ReportDefinition =>
  definitionOf({ ...row, version: `${row.id}:${row.updatedAt.getTime()}` });

/**
 * Each DISCOM's report formats (PRD 3.18 "report templates are linked per DISCOM"). Every
 * DISCOM starts with OneOhm's formats: MSEDCL with all six, others with the national
 * ones (WCR, DCR undertaking, model agreement). A format still marked as OneOhm's own
 * follows the bundled file when it is corrected; one the owner uploaded is never touched.
 */
@Injectable()
export class ReportFormatsStore implements OnApplicationBootstrap {
  private readonly log = new Logger('Reports');
  private synced: Promise<void> | null = null;
  private readonly seeded = new Set<string>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onApplicationBootstrap(): void {
    void this.sync().catch((error: unknown) =>
      this.log.error(`Report formats could not be set up: ${String(error)}`),
    );
  }

  /** Once per start: every DISCOM's formats, and OneOhm's own kept current. */
  sync(): Promise<void> {
    this.synced ??= this.syncNow().catch((error: unknown) => {
      this.synced = null;
      throw error;
    });
    return this.synced;
  }

  /** A DISCOM added since the start gets its formats the first time it is needed. */
  async ensure(discomId: string): Promise<void> {
    await this.sync();
    if (this.seeded.has(discomId)) return;
    const [discom] = await this.db
      .select({ id: discoms.id, code: discoms.code })
      .from(discoms)
      .where(eq(discoms.id, discomId));
    if (discom) await this.seed(discom);
  }

  /** Every DISCOM's switched-on formats, in the order reports are listed. */
  async definitions(): Promise<ReportDefinition[]> {
    await this.sync();
    const rows = await this.db
      .select()
      .from(discomReportTemplates)
      .where(eq(discomReportTemplates.active, true))
      .orderBy(asc(discomReportTemplates.position), asc(discomReportTemplates.createdAt));
    return rows.map(formatDefinition);
  }

  /** One DISCOM's switched-on format for a key. */
  async definition(discomId: string, key: string): Promise<ReportDefinition | null> {
    await this.ensure(discomId);
    const [row] = await this.db
      .select()
      .from(discomReportTemplates)
      .where(
        and(
          eq(discomReportTemplates.discomId, discomId),
          eq(discomReportTemplates.key, key),
          eq(discomReportTemplates.active, true),
        ),
      );
    return row ? formatDefinition(row) : null;
  }

  private async syncNow(): Promise<void> {
    const all = await this.db.select({ id: discoms.id, code: discoms.code }).from(discoms);
    for (const discom of all) await this.seed(discom);
    const own = await this.db
      .select({
        id: discomReportTemplates.id,
        key: discomReportTemplates.key,
        body: discomReportTemplates.body,
      })
      .from(discomReportTemplates)
      .where(eq(discomReportTemplates.source, 'built_in'));
    for (const row of own) {
      const bundled = builtInTemplate(row.key);
      if (bundled === null || bundled === row.body) continue;
      await this.db
        .update(discomReportTemplates)
        .set({ body: bundled, updatedAt: new Date() })
        .where(eq(discomReportTemplates.id, row.id));
      this.log.log(`Report format ${row.key} follows OneOhm's corrected file.`);
    }
  }

  /** OneOhm's formats for a DISCOM that has none yet (switched-off ones count as having). */
  private async seed(discom: { readonly id: string; readonly code: string }): Promise<void> {
    const [existing] = await this.db
      .select({ id: discomReportTemplates.id })
      .from(discomReportTemplates)
      .where(eq(discomReportTemplates.discomId, discom.id))
      .limit(1);
    if (!existing) {
      // The owner's earlier choice of what customers see carries over (report settings).
      const chosen = new Map(
        (await this.db.select().from(reportSettings)).map((row) => [row.key, row.customerVisible]),
      );
      const formats = BUILT_IN_REPORTS.map((report, position) => ({ report, position })).filter(
        ({ report }) => !report.discomCodes || report.discomCodes.includes(discom.code),
      );
      await this.db
        .insert(discomReportTemplates)
        .values(
          formats.map(({ report, position }) => ({
            discomId: discom.id,
            key: report.key,
            name: report.name,
            body: builtInTemplate(report.key) ?? '',
            onlyWithSubsidy: report.onlyWithSubsidy,
            customerVisible: chosen.get(report.key) ?? report.customerVisible,
            position,
          })),
        )
        .onConflictDoNothing();
    }
    this.seeded.add(discom.id);
  }
}
