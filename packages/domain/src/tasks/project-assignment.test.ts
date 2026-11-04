import { describe, expect, it } from 'vitest';
import type { AssigneeCandidate } from './generate-tasks';
import {
  type ContractorOption,
  chooseContractor,
  outsideTeamFor,
  type ProjectPool,
  pickProjectAssignee,
  servesArea,
} from './project-assignment';

const person = (
  userId: string,
  roleKeys: string[],
  openTasks = 0,
  extra: Partial<AssigneeCandidate> = {},
): AssigneeCandidate => ({ userId, roleKeys, openTasks, onLeave: false, ...extra });

const contractor = (id: string, extra: Partial<ContractorOption> = {}): ContractorOption => ({
  id,
  active: true,
  roleKeys: ['ic_partner'],
  serviceAreas: [],
  crew: [],
  leadUserId: null,
  openTasks: 0,
  ...extra,
});

const kamble = contractor('kamble', { crew: ['k-lead', 'k-2'], leadUserId: 'k-lead' });
const patil = contractor('patil', { crew: ['p-1'], openTasks: 9 });
const people = [
  person('asha', ['execution'], 3),
  person('ravi', ['execution'], 0),
  person('meena', ['liaisoning'], 1),
  person('k-lead', ['ic_partner'], 6),
  person('k-2', ['ic_partner'], 0),
  person('p-1', ['ic_partner'], 0),
];
const crewOf = new Map([
  ['k-lead', 'kamble'],
  ['k-2', 'kamble'],
  ['p-1', 'patil'],
]);
const need = (roleKey: string) => ({ roleKey, startDate: '2026-11-10', dueDate: '2026-11-11' });

describe('pickProjectAssignee (PRD 3.8, 3.13)', () => {
  const pool: ProjectPool = { team: ['asha'], contractor: kamble, crewOf };

  it('gives crew work to the project contractor’s lead, even when busier', () => {
    expect(pickProjectAssignee(people, pool, need('ic_partner'))).toEqual({
      userId: 'k-lead',
      outsideTeam: false,
    });
  });

  it('uses the least-loaded crew member of the same contractor when the lead is away', () => {
    const away = people.map((p) => (p.userId === 'k-lead' ? { ...p, onLeave: true } : p));
    expect(pickProjectAssignee(away, pool, need('ic_partner')).userId).toBe('k-2');
  });

  it('never splits crew work to another contractor', () => {
    const allAway = people.map((p) =>
      crewOf.get(p.userId) === 'kamble' ? { ...p, onLeave: true } : p,
    );
    expect(pickProjectAssignee(allAway, pool, need('ic_partner')).userId).toBeNull();
  });

  it('keeps in-house work in the named team, even when someone else is free', () => {
    expect(pickProjectAssignee(people, pool, need('execution'))).toEqual({
      userId: 'asha',
      outsideTeam: false,
    });
  });

  it('falls back to the whole company, flagged, when nobody in the team fits', () => {
    expect(pickProjectAssignee(people, pool, need('liaisoning'))).toEqual({
      userId: 'meena',
      outsideTeam: true,
    });
  });

  it('with no team named, picks from the company without a flag', () => {
    const open: ProjectPool = { team: [], contractor: kamble, crewOf };
    expect(pickProjectAssignee(people, open, need('execution'))).toEqual({
      userId: 'ravi',
      outsideTeam: false,
    });
  });

  it('never gives crew work to a contractor’s crew when the project has no contractor', () => {
    const none: ProjectPool = { team: [], contractor: null, crewOf };
    expect(pickProjectAssignee(people, none, need('ic_partner')).userId).toBeNull();
  });
});

describe('chooseContractor', () => {
  it('picks the least busy active contractor who takes the work and serves the area', () => {
    expect(chooseContractor([patil, kamble], ['ic_partner'], ['Sangli'])?.id).toBe('kamble');
  });

  it('skips inactive contractors, wrong skills and other areas', () => {
    const off = { ...kamble, active: false };
    const civil = contractor('civil', { roleKeys: ['civil'], crew: ['c'] });
    const pune = contractor('pune', { serviceAreas: ['Pune'], crew: ['x'] });
    expect(chooseContractor([off, civil, pune], ['ic_partner'], ['Sangli', 'Miraj'])).toBeNull();
    expect(chooseContractor([off, civil, pune], ['ic_partner'], ['pune'])?.id).toBe('pune');
  });

  it('skips a contractor with no crew to assign', () => {
    expect(chooseContractor([contractor('empty')], ['ic_partner'], [])).toBeNull();
  });
});

describe('servesArea', () => {
  it('matches a district or town, ignoring case and spaces', () => {
    expect(servesArea({ serviceAreas: [' Sangli ', 'Kolhapur'] }, ['Miraj', 'sangli'])).toBe(true);
    expect(servesArea({ serviceAreas: ['Kolhapur'] }, ['Miraj', 'Sangli'])).toBe(false);
    expect(servesArea({ serviceAreas: [] }, ['Anywhere'])).toBe(true);
  });
});

describe('outsideTeamFor', () => {
  const crew = new Set(['crew-1']);
  it('flags only staff outside a named team', () => {
    expect(outsideTeamFor('a', [], crew)).toBe(false);
    expect(outsideTeamFor('a', ['a', 'b'], crew)).toBe(false);
    expect(outsideTeamFor('crew-1', ['a'], crew)).toBe(false);
    expect(outsideTeamFor('z', ['a'], crew)).toBe(true);
    expect(outsideTeamFor(null, ['a'], crew)).toBe(false);
  });
});
