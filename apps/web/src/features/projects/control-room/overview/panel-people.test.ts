import type { ProjectDetail } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { panelPeople } from './panel-people';

const person = (id: string) => ({ id, fullName: `Person ${id}` });
const task = (assigneeId: string | null, status = 'ready') => ({
  status,
  assignee: assigneeId ? person(assigneeId) : null,
});

function projectOf(
  manager: string | null,
  team: { id: string; active?: boolean }[],
  tasks: ReturnType<typeof task>[],
): ProjectDetail {
  return {
    manager: manager ? person(manager) : null,
    setup: { team: team.map((m) => ({ ...person(m.id), active: m.active ?? true })) },
    tasks,
  } as unknown as ProjectDetail;
}

describe('panelPeople', () => {
  it('lists the manager first, then the named team, even with no tasks', () => {
    const result = panelPeople(projectOf('m', [{ id: 'a' }, { id: 'b' }], [task('a')]));
    expect(result.manager?.id).toBe('m');
    expect(result.team.map((p) => [p.id, p.open])).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    expect(result.others).toEqual([]);
  });

  it('counts open and done tasks', () => {
    const result = panelPeople(
      projectOf('m', [{ id: 'a' }], [task('a'), task('a', 'completed'), task('m')]),
    );
    expect(result.team[0]).toMatchObject({ open: 1, done: 1 });
    expect(result.manager).toMatchObject({ open: 1, done: 0 });
  });

  it('marks a member who has left', () => {
    const result = panelPeople(projectOf('m', [{ id: 'a', active: false }], []));
    expect(result.team[0]?.inactive).toBe(true);
  });

  it('puts other assignees with open work under others, not finished ones', () => {
    const result = panelPeople(
      projectOf('m', [{ id: 'a' }], [task('x'), task('y', 'completed'), task(null)]),
    );
    expect(result.others.map((p) => p.id)).toEqual(['x']);
  });

  it('shows a manager who is also on the team once, as the manager', () => {
    const result = panelPeople(projectOf('m', [{ id: 'm' }, { id: 'a' }], []));
    expect(result.team.map((p) => p.id)).toEqual(['a']);
  });

  it('with no named team, lists the manager and the assignees', () => {
    const result = panelPeople(projectOf('m', [], [task('x')]));
    expect(result.team).toEqual([]);
    expect(result.others.map((p) => p.id)).toEqual(['x']);
  });
});
