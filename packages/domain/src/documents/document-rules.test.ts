import { describe, expect, it } from 'vitest';
import { appliesToProject, builtInRequirements, requirementsFor } from './document-rules';
import { type RequirementContext, requiredDocuments } from './required-documents';

const contexts: RequirementContext[] = [
  { type: 'residential', loan: false, subsidy: true, nameChange: false },
  { type: 'society', loan: true, subsidy: false, nameChange: true },
  { type: 'commercial', loan: false, subsidy: false, nameChange: false },
];

describe('configurable document rules (PRD 3.14)', () => {
  it('gives the same papers as the built-in list until the owner changes it', () => {
    for (const context of contexts) {
      expect(requirementsFor(builtInRequirements(), context).map((r) => r.key)).toEqual(
        requiredDocuments(context).map((r) => r.key),
      );
    }
  });

  it('drops a paper the owner switched off', () => {
    const list = builtInRequirements().map((r) =>
      r.key === 'warranty' ? { ...r, active: false } : r,
    );
    const keys = requirementsFor(list, contexts[0] as RequirementContext).map((r) => r.key);
    expect(keys).not.toContain('warranty');
  });

  it('limits a paper to some DISCOMs', () => {
    const base = { type: 'residential', loan: false, subsidy: false, nameChange: false } as const;
    expect(appliesToProject({ discomCodes: ['MSEDCL'] }, { ...base, discomCode: 'MSEDCL' })).toBe(
      true,
    );
    expect(appliesToProject({ discomCodes: ['MSEDCL'] }, { ...base, discomCode: 'TPC' })).toBe(
      false,
    );
    expect(appliesToProject({ discomCodes: ['MSEDCL'] }, base)).toBe(false);
  });
});
