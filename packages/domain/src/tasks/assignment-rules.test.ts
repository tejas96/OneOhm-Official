import { describe, expect, it } from 'vitest';
import { type AssignmentRules, DEFAULT_ASSIGNMENT_RULES } from '../settings/assignment-rules';
import { type AssigneeCandidate, pickAssignee } from './generate-tasks';
import { type ProjectPool, pickProjectAssignee } from './project-assignment';

const person = (
  userId: string,
  openTasks: number,
  extra: Partial<AssigneeCandidate> = {},
): AssigneeCandidate => ({ userId, roleKeys: ['execution'], openTasks, onLeave: false, ...extra });

const rules = (patch: Partial<AssignmentRules>): AssignmentRules => ({
  ...DEFAULT_ASSIGNMENT_RULES,
  ...patch,
});
const week = { from: '2026-11-10', to: '2026-11-12' };

describe('assignment rules from Settings (PRD 7.2)', () => {
  const busyButWaiting = person('asha', 5, { lastAssignedAt: '2026-10-01T09:00:00Z' });
  const freeButRecent = person('ravi', 0, { lastAssignedAt: '2026-10-30T09:00:00Z' });

  it('least busy picks the person with the fewest open tasks', () => {
    expect(pickAssignee([busyButWaiting, freeButRecent], 'execution')?.userId).toBe('ravi');
  });

  it('round robin picks whoever got work longest ago, and never-assigned first', () => {
    const roundRobin = rules({ strategy: 'round_robin' });
    const picked = pickAssignee(
      [busyButWaiting, freeButRecent],
      'execution',
      week,
      null,
      roundRobin,
    );
    expect(picked?.userId).toBe('asha');
    const newcomer = person('zoya', 9);
    expect(
      pickAssignee([busyButWaiting, newcomer], 'execution', week, null, roundRobin)?.userId,
    ).toBe('zoya');
  });

  it('skips people on approved leave only while the rule is on', () => {
    const away = person('ravi', 0, { away: [{ from: '2026-11-11', to: '2026-11-11' }] });
    const other = person('asha', 4);
    expect(pickAssignee([away, other], 'execution', week)?.userId).toBe('asha');
    const ignoreLeave = rules({ skipLeave: false });
    expect(pickAssignee([away, other], 'execution', week, null, ignoreLeave)?.userId).toBe('ravi');
  });

  it('always skips someone marked unavailable by hand', () => {
    const off = person('ravi', 0, { onLeave: true });
    const ignoreLeave = rules({ skipLeave: false });
    expect(pickAssignee([off], 'execution', week, null, ignoreLeave)).toBeNull();
  });

  it('prefers the skill only while the rule is on', () => {
    const skilled = person('asha', 4, { skills: ['net_metering'] });
    const free = person('ravi', 0);
    expect(pickAssignee([skilled, free], 'execution', week, 'net_metering')?.userId).toBe('asha');
    const noSkill = rules({ preferSkill: false });
    expect(pickAssignee([skilled, free], 'execution', week, 'net_metering', noSkill)?.userId).toBe(
      'ravi',
    );
  });

  it('with "project team first" off, the whole company is one pool', () => {
    const pool: ProjectPool = { team: ['asha'], contractor: null, crewOf: new Map() };
    const people = [person('asha', 6), person('ravi', 0)];
    const need = { roleKey: 'execution', startDate: '2026-11-10', dueDate: '2026-11-12' };
    expect(pickProjectAssignee(people, pool, need)).toEqual({ userId: 'asha', outsideTeam: false });
    expect(pickProjectAssignee(people, pool, need, rules({ teamFirst: false }))).toEqual({
      userId: 'ravi',
      outsideTeam: true,
    });
  });
});
