import type { ProjectDetail } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { seedTeamForm } from './seed-team-form';

const project = (manager: string | null, team: string[], target: string | null) =>
  ({
    manager: manager ? { id: manager, fullName: 'M' } : null,
    setup: {
      team: team.map((id) => ({ id, fullName: id, active: true })),
      targetFinishDate: target,
    },
  }) as unknown as ProjectDetail;

describe('seedTeamForm', () => {
  it('copies manager, team and target from the project', () => {
    expect(seedTeamForm(project('m', ['a', 'b'], '2099-01-01'))).toEqual({
      manager: 'm',
      team: ['a', 'b'],
      target: '2099-01-01',
    });
  });

  it('uses empty values when nothing is set', () => {
    expect(seedTeamForm(project(null, [], null))).toEqual({
      manager: undefined,
      team: [],
      target: '',
    });
  });

  it('re-seeding from a fresher project replaces older values', () => {
    const older = seedTeamForm(project('m', ['a'], null));
    const fresh = seedTeamForm(project('m', ['a', 'c'], null));
    expect(fresh.team).not.toEqual(older.team);
    expect(fresh.team).toEqual(['a', 'c']);
  });
});
