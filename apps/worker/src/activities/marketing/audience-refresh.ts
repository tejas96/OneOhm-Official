import type { DatabaseExecutor } from '@oneohm/database';
import { mergeJobData, readJob } from './job-store';

const DAY_MS = 86_400_000;

/** Google keeps list members for 30 days, so the full list goes up again every 25. */
export const FULL_UPLOAD_DAYS = 25;

const keyOf = (kind: string) => `google_${kind}_full_upload`;

/** Whether this Google list is due its full upload (never done, or 25 days ago). */
export async function fullUploadDue(
  db: DatabaseExecutor,
  kind: string,
  now: Date,
): Promise<boolean> {
  const at = (await readJob(db, 'audiences'))?.data?.[keyOf(kind)];
  const last = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  return Number.isNaN(last) || now.getTime() - last >= FULL_UPLOAD_DAYS * DAY_MS;
}

/** Notes that the full list went up, so the next full upload is 25 days away. */
export async function markFullUpload(db: DatabaseExecutor, kind: string, now: Date) {
  await mergeJobData(db, 'audiences', { [keyOf(kind)]: now.toISOString() });
}
