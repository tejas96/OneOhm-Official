import { Inject, Injectable } from '@nestjs/common';
import type { ReportStatus } from '@oneohm/api-contracts';
import { projectActivities, projectFacts, projects } from '@oneohm/database';
import { factLabel, KNOWN_FACT_KEYS } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ReportArchiveService } from './report-archive.service';
import { ReportFormatsStore } from './report-formats.store';
import { ReportStatusService } from './report-status.service';

/** Details too personal to copy into the audit trail in full. */
const MASKED = new Set(['consumer_aadhaar_number']);
const mask = (key: string, value: string | null) =>
  value && MASKED.has(key) ? `•••• ${value.replace(/\D/g, '').slice(-4)}` : value;

/**
 * Report details recorded from the reports card (PRD 3.18): what a task finished before
 * it asked for them, or a correction. Each change is audited with the old value, and
 * the reports are saved again by themselves.
 */
@Injectable()
export class ReportFactsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly statuses: ReportStatusService,
    private readonly archive: ReportArchiveService,
    private readonly formats: ReportFormatsStore,
  ) {}

  async record(
    actor: Actor,
    projectId: string,
    input: Readonly<Record<string, string>>,
  ): Promise<ReportStatus[]> {
    assertCan(actor, 'reports.generate');
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw notFound('That project');
    const entries = Object.entries(input)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== '');
    // Any detail a recorded fact or some DISCOM's format prints (Settings → DISCOMs).
    const known = new Set([
      ...KNOWN_FACT_KEYS,
      ...(await this.formats.definitions()).flatMap((definition) => definition.required),
    ]);
    const unknown = entries.filter(([key]) => !known.has(key));
    if (unknown.length > 0)
      throw invalid(
        'These are not report details.',
        Object.fromEntries(unknown.map(([key]) => [key, 'Not a report detail.'])),
      );
    if (entries.length === 0) throw invalid('Fill in at least one detail.');
    const keys = entries.map(([key]) => key);
    const before = await this.db
      .select({ key: projectFacts.key, value: projectFacts.value })
      .from(projectFacts)
      .where(and(eq(projectFacts.projectId, projectId), inArray(projectFacts.key, keys)));
    const old = new Map(before.map((row) => [row.key, row.value]));
    const changed = entries.filter(([key, value]) => old.get(key) !== value);
    if (changed.length > 0) await this.save(actor, projectId, changed, old);
    this.archive.refreshLater(projectId, actor.userId);
    return this.statuses.statuses(projectId);
  }

  private async save(
    actor: Actor,
    projectId: string,
    changed: readonly (readonly [string, string])[],
    old: ReadonlyMap<string, string>,
  ) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      for (const [key, value] of changed) {
        await tx
          .insert(projectFacts)
          .values({ projectId, key, value, capturedByTaskId: null })
          .onConflictDoUpdate({
            target: [projectFacts.projectId, projectFacts.key],
            set: { value, updatedAt: now },
          });
      }
      const labels = changed.map(([key]) => factLabel(key));
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'report',
        message: `Report details recorded: ${labels.join(', ')}.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'report.facts_recorded', 'project', projectId, {
        changes: changed.map(([key, value]) => ({
          key,
          before: mask(key, old.get(key) ?? null),
          after: mask(key, value),
        })),
      });
    });
  }
}
