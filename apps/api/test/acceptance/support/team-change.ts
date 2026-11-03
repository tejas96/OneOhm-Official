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
