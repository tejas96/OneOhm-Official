import { describe, expect, it } from 'vitest';
import { proposalRights } from './proposal-rights';

describe('proposalRights', () => {
  it('lets someone with the right confirm or pick', () => {
    expect(proposalRights({ canAssign: true, viewerId: 'a', proposedId: 'b' })).toEqual({
      confirm: true,
      pick: true,
    });
  });

  it('hides Confirm when the proposal names the viewer, but still lets them pick', () => {
    expect(proposalRights({ canAssign: true, viewerId: 'a', proposedId: 'a' })).toEqual({
      confirm: false,
      pick: true,
    });
  });

  it('offers nothing without the right to assign', () => {
    expect(proposalRights({ canAssign: false, viewerId: 'a', proposedId: 'b' })).toEqual({
      confirm: false,
      pick: false,
    });
  });
});
