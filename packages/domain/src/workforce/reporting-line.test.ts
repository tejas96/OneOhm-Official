import { describe, expect, it } from 'vitest';
import {
  helpRecipients,
  leaveFirstReviewer,
  mayDecidePoints,
  reportingLineProblem,
} from './reporting-line';

describe('reports to', () => {
  const managers = new Map([
    ['asha', 'vikas'],
    ['vikas', 'owner'],
  ]);

  it('allows no manager, or anyone above who does not lead back', () => {
    expect(reportingLineProblem({ userId: 'asha', managerUserId: null, managers })).toBeNull();
    expect(reportingLineProblem({ userId: 'priya', managerUserId: 'asha', managers })).toBeNull();
    expect(reportingLineProblem({ userId: 'asha', managerUserId: 'owner', managers })).toBeNull();
  });

  it('refuses reporting to yourself', () => {
    expect(reportingLineProblem({ userId: 'asha', managerUserId: 'asha', managers })).toBe('self');
  });

  it('refuses a circle, however long', () => {
    expect(reportingLineProblem({ userId: 'vikas', managerUserId: 'asha', managers })).toBe('loop');
    expect(reportingLineProblem({ userId: 'owner', managerUserId: 'asha', managers })).toBe('loop');
  });

  it('stops on a circle that was already there', () => {
    const broken = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    expect(reportingLineProblem({ userId: 'c', managerUserId: 'a', managers: broken })).toBeNull();
  });
});

describe('leave goes to the manager first', () => {
  it('goes to an active manager', () => {
    expect(
      leaveFirstReviewer({ applicantUserId: 'asha', manager: { id: 'vikas', active: true } }),
    ).toBe('vikas');
  });

  it('goes straight to the approvers without one, or when they are inactive', () => {
    expect(leaveFirstReviewer({ applicantUserId: 'asha', manager: null })).toBeNull();
    expect(
      leaveFirstReviewer({ applicantUserId: 'asha', manager: { id: 'vikas', active: false } }),
    ).toBeNull();
    expect(
      leaveFirstReviewer({ applicantUserId: 'asha', manager: { id: 'asha', active: true } }),
    ).toBeNull();
  });
});

describe('help asked on a task', () => {
  it('tells the project manager and the asker’s manager', () => {
    expect(
      helpRecipients({
        askerUserId: 'asha',
        projectManagerUserId: 'pm',
        askerManagerUserId: 'vikas',
      }),
    ).toEqual({ userIds: ['pm', 'vikas'], projectManagers: false });
  });

  it('tells everyone who manages projects when the project has no manager', () => {
    expect(
      helpRecipients({ askerUserId: 'asha', projectManagerUserId: null, askerManagerUserId: null }),
    ).toEqual({ userIds: [], projectManagers: true });
    expect(
      helpRecipients({
        askerUserId: 'asha',
        projectManagerUserId: 'asha',
        askerManagerUserId: 'vikas',
      }),
    ).toEqual({ userIds: ['vikas'], projectManagers: true });
  });

  it('tells someone who is both only once', () => {
    expect(
      helpRecipients({ askerUserId: 'asha', projectManagerUserId: 'pm', askerManagerUserId: 'pm' }),
    ).toEqual({ userIds: ['pm'], projectManagers: false });
  });
});

describe('who may decide points', () => {
  const managers = new Map([
    ['asha', 'vikas'],
    ['vikas', 'meena'],
  ]);
  const base = {
    deciderUserId: 'vikas',
    deciderIsSuperAdmin: false,
    earnerUserId: 'asha',
    earnerIsSuperAdmin: false,
    managers,
  };

  it('lets a manager, directly or higher up, decide', () => {
    expect(mayDecidePoints(base)).toBe(true);
    expect(mayDecidePoints({ ...base, deciderUserId: 'meena' })).toBe(true);
  });

  it('refuses peers, people below and people with no line to the earner', () => {
    expect(mayDecidePoints({ ...base, deciderUserId: 'priya' })).toBe(false);
    expect(mayDecidePoints({ ...base, deciderUserId: 'asha', earnerUserId: 'vikas' })).toBe(false);
    expect(mayDecidePoints({ ...base, managers: new Map() })).toBe(false);
  });

  it('never lets anyone decide their own, Super Admin included', () => {
    expect(mayDecidePoints({ ...base, deciderUserId: 'asha' })).toBe(false);
    const own = { ...base, deciderUserId: 'root', earnerUserId: 'root', deciderIsSuperAdmin: true };
    expect(mayDecidePoints(own)).toBe(false);
  });

  it('lets a Super Admin decide anyone else’s, and keeps a Super Admin’s to Super Admins', () => {
    const root = { ...base, deciderUserId: 'root', deciderIsSuperAdmin: true };
    expect(mayDecidePoints({ ...root, managers: new Map() })).toBe(true);
    const adminEarns = { ...base, earnerUserId: 'root', earnerIsSuperAdmin: true };
    expect(mayDecidePoints(adminEarns)).toBe(false);
    expect(
      mayDecidePoints({ ...adminEarns, deciderUserId: 'boss', deciderIsSuperAdmin: true }),
    ).toBe(true);
  });
});
