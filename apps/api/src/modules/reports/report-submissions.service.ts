import { Inject, Injectable } from '@nestjs/common';
import type { ReportStatus } from '@oneohm/api-contracts';
import { projectActivities, reportSubmissions } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ReportArchiveService } from './report-archive.service';
import { loadFiling } from './report-filing';
import { assertReportReady } from './report-readiness';
import { ReportStatusService } from './report-status.service';

/**
 * A report handed to the DISCOM or the subsidy portal (PRD 3.18): the copy in the
 * documents is the one submitted, so it is no longer saved again by itself. When the
 * data behind it changes afterwards the report says so, and the person decides.
 */
@Injectable()
export class ReportSubmissionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly statuses: ReportStatusService,
    private readonly archive: ReportArchiveService,
  ) {}

  async mark(
    actor: Actor,
    projectId: string,
    key: string,
    submitted: boolean,
  ): Promise<ReportStatus[]> {
    assertCan(actor, 'reports.generate');
    const report = (await this.statuses.statuses(projectId)).find((status) => status.key === key);
    if (!report) throw notFound('That report');
    if (submitted) await this.submit(actor, projectId, key, report.name);
    else await this.undo(actor, projectId, key, report.name);
    return this.statuses.statuses(projectId);
  }

  private async submit(actor: Actor, projectId: string, key: string, name: string) {
    const before = (await this.statuses.statuses(projectId)).find((status) => status.key === key);
    if (!before) throw notFound('That report');
    if (before.filing?.submittedAt)
      throw conflict(`${name} is already marked as submitted.`, 'submitted');
    assertReportReady(before);
    // The submitted copy is the current one: save it first when the data changed.
    await this.archive.refresh(projectId, actor.userId, 'manual', key);
    const now = (await this.statuses.statuses(projectId)).find((status) => status.key === key);
    const documentId = now?.filing?.documentId ?? null;
    const fingerprint = await this.currentFingerprint(projectId, key);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(reportSubmissions)
        .values({
          projectId,
          reportKey: key,
          documentId,
          fingerprint,
          submittedByUserId: actor.userId,
        })
        .onConflictDoNothing();
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'report',
        message: `${name} marked as submitted.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'report.submitted', 'project', projectId, {
        report: key,
        documentId,
      });
    });
  }

  private async undo(actor: Actor, projectId: string, key: string, name: string) {
    await this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(reportSubmissions)
        .where(
          and(eq(reportSubmissions.projectId, projectId), eq(reportSubmissions.reportKey, key)),
        )
        .returning({ id: reportSubmissions.id });
      if (removed.length === 0) return;
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'report',
        message: `${name} is no longer marked as submitted.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'report.submission_undone', 'project', projectId, {
        report: key,
      });
    });
  }

  /** The fingerprint of the saved copy (it was just made from the current data). */
  private async currentFingerprint(projectId: string, key: string): Promise<string> {
    const filing = await loadFiling(this.db, projectId);
    const print = filing.saved.get(key)?.fingerprint;
    if (!print) throw conflict('Save the report before marking it as submitted.', 'not_saved');
    return print;
  }
}
