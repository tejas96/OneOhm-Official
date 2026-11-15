import { type DatabaseExecutor, marketingJobs } from '@oneohm/database';
import { eq } from 'drizzle-orm';

const KEY = 'sandbox_templates';

/** What practice mode remembers of each message: approved, and whether with its photo header. */
export type PracticeTemplates = Readonly<Record<string, { approved: boolean; withImage: boolean }>>;

/** Practice approvals live only here; the real message rows are never touched in practice mode. */
export async function readPracticeTemplates(db: DatabaseExecutor): Promise<PracticeTemplates> {
  const [job] = await db.select().from(marketingJobs).where(eq(marketingJobs.key, KEY));
  return (job?.data ?? {}) as PracticeTemplates;
}

export async function approvePracticeTemplate(
  db: DatabaseExecutor,
  key: string,
  withImage: boolean,
): Promise<void> {
  const data = { ...(await readPracticeTemplates(db)), [key]: { approved: true, withImage } };
  const now = new Date();
  await db
    .insert(marketingJobs)
    .values({ key: KEY, ranAt: now, data })
    .onConflictDoUpdate({ target: marketingJobs.key, set: { data, updatedAt: now } });
}

/** The keys practice mode counts as approved. */
export const practiceApprovedKeys = (practice: PracticeTemplates): Set<string> =>
  new Set(
    Object.entries(practice)
      .filter(([, value]) => value.approved)
      .map(([key]) => key),
  );
