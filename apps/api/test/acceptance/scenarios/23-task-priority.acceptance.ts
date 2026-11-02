import type { ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { project, workTask } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// Spec 3.3: managers set a priority, every change goes into the history with who made it,
// and a task holding up an Urgent one says so.
describe('Task priority', () => {
  let admin: Session;
  let sale: Sale;
  const priorityLines = async (taskId: string) =>
    (
      await admin.get<{ kind: string; taskId: string | null }[]>(`/tasks/${taskId}/activity`)
    ).filter((line) => line.kind === 'priority_set' && line.taskId === taskId);

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Priority Order (test)' });
  });
  afterAll(closeDb);

  it('an assigner sets urgent and it shows with who set it', async () => {
    const task = (await project(admin, sale.project.id)).tasks[0] as ProjectTask;
    const set = await admin.post<ProjectTask>(`/tasks/${task.id}/priority`, { priority: 'urgent' });
    expect(set.priority).toBe('urgent');
    expect(set.prioritySetBy?.id).toBe(admin.userId);
    expect(await priorityLines(task.id)).toHaveLength(1);
  });

  it('the Command Center task board shows the priority', async () => {
    const task = (await project(admin, sale.project.id)).tasks[0] as ProjectTask;
    const board = await admin.get<{ rows: { id: string; priority?: string }[] }>(
      `/command-center/tasks?projectId=${sale.project.id}`,
    );
    expect(board.rows.find((row) => row.id === task.id)?.priority).toBe('urgent');
  });

  it('setting the same priority twice writes one history line', async () => {
    const task = (await project(admin, sale.project.id)).tasks[0] as ProjectTask;
    await admin.post(`/tasks/${task.id}/priority`, { priority: 'urgent' });
    expect(await priorityLines(task.id)).toHaveLength(1);
  });

  it('saves at the same moment still write one history line', async () => {
    const task = (await project(admin, sale.project.id)).tasks[1] as ProjectTask;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        admin.raw('POST', `/tasks/${task.id}/priority`, { priority: 'high' }),
      ),
    );
    expect(await priorityLines(task.id)).toHaveLength(1);
  });

  it('a blocker of an urgent task says so', async () => {
    const detail = await project(admin, sale.project.id);
    const blocked = detail.tasks.find((task) => task.blockedBy.length > 0) as ProjectTask;
    await admin.post(`/tasks/${blocked.id}/priority`, { priority: 'urgent' });
    const after = await project(admin, sale.project.id);
    const blocker = after.tasks.find((task) => task.title === blocked.blockedBy[0]);
    expect(blocker?.blocksUrgent).toBe(true);
    const again = after.tasks.find((task) => task.id === blocked.id);
    expect(again?.blockers[0]?.title).toBe(blocked.blockedBy[0]);
  });

  it('the whole chain under an urgent task is lifted', async () => {
    const chainSale = await sellProject(admin, { name: 'Urgent Chain (test)' });
    const detail = await project(admin, chainSale.project.id);
    const byTitle = (title: string) => detail.tasks.find((task) => task.title === title);
    // C waits for B, and B waits for A: mark C urgent, A must rise too.
    const c = detail.tasks.find((task) => {
      const b = byTitle(task.blockedBy[0] ?? '');
      return Boolean(b && b.blockedBy.length > 0);
    }) as ProjectTask;
    const b = byTitle(c.blockedBy[0] ?? '') as ProjectTask;
    await admin.post(`/tasks/${c.id}/priority`, { priority: 'urgent' });
    const after = await project(admin, chainSale.project.id);
    const a = after.tasks.find((task) => task.title === b.blockedBy[0]);
    expect(after.tasks.find((task) => task.id === b.id)?.blocksUrgent).toBe(true);
    expect(a?.blocksUrgent).toBe(true);
  });

  it('someone without tasks.assign is refused', async () => {
    const task = (await project(admin, sale.project.id)).tasks[0] as ProjectTask;
    const sales = await Session.password(staffEmail('sales'), TEAM_PASSWORD);
    const reply = await sales.raw('POST', `/tasks/${task.id}/priority`, { priority: 'low' });
    expect(reply.status).toBe(403);
  });

  it('a done task cannot change priority', async () => {
    const ready = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.status === 'ready',
    ) as ProjectTask;
    const done = await workTask(admin, ready);
    expect(done.status).toBe('completed');
    const reply = await admin.raw('POST', `/tasks/${ready.id}/priority`, { priority: 'high' });
    expect(reply.status).toBe(409);
  });
});
