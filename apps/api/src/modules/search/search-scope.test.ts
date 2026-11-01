import { SEARCH_TYPES } from '@oneohm/api-contracts';
import { type Capability, DEFAULT_ROLES, type RoleKind } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { type Searcher, searchableTypes, seesAllDocuments, seesAllTasks } from './search-scope';

function searcher(roleKey: string): Searcher {
  const role = DEFAULT_ROLES.find((candidate) => candidate.key === roleKey);
  if (!role) throw new Error(`No role ${roleKey}`);
  return {
    userId: 'u1',
    kind: role.kind as RoleKind,
    capabilities: new Set<Capability>(role.capabilities),
  };
}

describe('universal search scope', () => {
  it('lets a super admin search everything', () => {
    expect(searchableTypes(searcher('super_admin'), SEARCH_TYPES)).toEqual([...SEARCH_TYPES]);
  });

  it('keeps a reseller to leads and quotations (narrowed to their own later)', () => {
    expect(searchableTypes(searcher('reseller'), SEARCH_TYPES)).toEqual(['leads', 'quotations']);
  });

  it('keeps a crew to its own tasks and files', () => {
    const crew = searcher('ic_partner');
    expect(searchableTypes(crew, SEARCH_TYPES)).toEqual(['tasks', 'documents']);
    expect(seesAllTasks(crew)).toBe(false);
    expect(seesAllDocuments(crew)).toBe(false);
  });

  it('gives accounts payments by receipt number, not contractors', () => {
    const types = searchableTypes(searcher('accounts'), SEARCH_TYPES);
    expect(types).toContain('payments');
    expect(types).not.toContain('contractors');
  });

  it('searches only the kinds asked for', () => {
    const asked = ['projects', 'tasks'] as const;
    expect(searchableTypes(searcher('execution'), asked)).toEqual(['projects', 'tasks']);
  });
});
