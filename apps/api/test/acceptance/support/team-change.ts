import { rows } from './db';
import type { Reply, Session } from './http';

/**
 * PATCH /projects/:id the way the web does: once the API reports a `version`, the body
 * carries the version it read (unless the test sets one itself). Returns the reply so a
 * test can check the status.
 */
export async function patchTeam(
  session: Session,
  projectId: string,
  body: Record<string, unknown>,
): Promise<Reply<unknown>> {
  const current = await session.get<{ version?: unknown }>(`/projects/${projectId}`);
  const payload =
    typeof current.version === 'number' && !('version' in body)
      ? { ...body, version: current.version }
      : body;
  return session.raw('PATCH', `/projects/${projectId}`, payload);
}

const DAY_MS = 86_400_000;

/**
 * Sets a project's manager history straight in the database: each entry holds the
 * project for `days` (the last one stays open). Measured back from now.
 */
export async function setManagerTerms(
  projectId: string,
  history: readonly { userId: string; days: number }[],
): Promise<void> {
  const total = history.reduce((sum, entry) => sum + entry.days, 0);
  let start = Date.now() - total * DAY_MS;
  await rows('DELETE FROM project_manager_terms WHERE project_id = $1', [projectId]);
  for (const [index, entry] of history.entries()) {
    const last = index === history.length - 1;
    const end = start + entry.days * DAY_MS;
    await rows(
      `INSERT INTO project_manager_terms (project_id, user_id, started_at, ended_at)
       VALUES ($1, $2, $3, $4)`,
      [projectId, entry.userId, new Date(start), last ? null : new Date(end)],
    );
    start = end;
  }
  const current = history.at(-1);
  if (current)
    await rows('UPDATE projects SET manager_user_id = $2 WHERE id = $1', [
      projectId,
      current.userId,
    ]);
}

/** Like `setManagerTerms`, with exact dates: each entry runs from `from` until `until` (null = still open). */
export async function setManagerTermsAt(
  projectId: string,
  history: readonly { userId: string; from: Date; until: Date | null }[],
): Promise<void> {
  await rows('DELETE FROM project_manager_terms WHERE project_id = $1', [projectId]);
  for (const entry of history)
    await rows(
      `INSERT INTO project_manager_terms (project_id, user_id, started_at, ended_at)
       VALUES ($1, $2, $3, $4)`,
      [projectId, entry.userId, entry.from, entry.until],
    );
  const current = history.at(-1);
  if (current)
    await rows('UPDATE projects SET manager_user_id = $2 WHERE id = $1', [
      projectId,
      current.userId,
    ]);
}
