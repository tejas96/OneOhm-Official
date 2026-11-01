import type { ReportStatus } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, reportSubmissions } from '@oneohm/database';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { savedFingerprint } from './report-fingerprint';

export interface SavedReport {
  readonly id: string;
  readonly storageKey: string;
  readonly createdAt: Date;
  readonly fingerprint: string | null;
}

export interface SubmittedReport {
  readonly submittedAt: Date;
  readonly fingerprint: string;
}

/** The project's current saved copy of each report, and which were handed in. */
export async function loadFiling(db: DatabaseExecutor, projectId: string) {
  const files = await db
    .select({
      id: documents.id,
      reportKey: documents.reportKey,
      storageKey: documents.storageKey,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.projectId, projectId),
        eq(documents.source, 'report'),
        isNull(documents.replacedAt),
        isNull(documents.removedAt),
      ),
    )
    .orderBy(desc(documents.createdAt));
  const saved = new Map<string, SavedReport>();
  for (const file of files) {
    if (!file.reportKey || saved.has(file.reportKey)) continue;
    saved.set(file.reportKey, { ...file, fingerprint: savedFingerprint(file.storageKey) });
  }
  const rows = await db
    .select()
    .from(reportSubmissions)
    .where(eq(reportSubmissions.projectId, projectId));
  const submitted = new Map<string, SubmittedReport>(
    rows.map((row) => [
      row.reportKey,
      { submittedAt: row.submittedAt, fingerprint: row.fingerprint },
    ]),
  );
  return { saved, submitted };
}

export type ReportFiling = Awaited<ReturnType<typeof loadFiling>>;

/** Where the report stands in the documents, given what its data would print now. */
export function filingOf(
  key: string,
  print: string,
  filing: ReportFiling,
): NonNullable<ReportStatus['filing']> {
  const saved = filing.saved.get(key);
  const submitted = filing.submitted.get(key);
  return {
    documentId: saved?.id ?? null,
    savedAt: saved?.createdAt.toISOString() ?? null,
    submittedAt: submitted?.submittedAt.toISOString() ?? null,
    changedSinceSaved: saved !== undefined && saved.fingerprint !== print,
    changedAfterSubmission: submitted !== undefined && submitted.fingerprint !== print,
  };
}
