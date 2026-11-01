import { describe, expect, it } from 'vitest';
import { checkTaskTemplate } from './template-checks';

const known = {
  keys: new Map<string, readonly string[]>([
    ['survey', []],
    ['design', ['survey']],
  ]),
  roles: new Set(['execution']),
  messages: new Map<string, readonly string[]>([
    ['project_milestone', ['customer', 'project', 'milestone']],
    ['payment_link', ['customer', 'amount', 'milestone', 'project', 'link']],
    ['project_update_link', ['customer', 'project', 'milestone', 'link']],
  ]),
};

const base = {
  key: 'install',
  title: 'Install',
  stage: 'installation' as const,
  roleKey: 'execution',
  offsetDays: 0,
  durationDays: 1,
  dependsOn: ['design'],
  conditions: null,
  waitingParty: 'internal' as const,
  customerVisible: true,
  notifyCustomer: true,
  notifyEvent: 'completed' as const,
  messageKey: 'project_milestone',
  customerTitle: 'Installation finished',
  recipients: 'customer' as const,
  attachment: null,
  notifyManager: false,
  confirmAssignee: false,
  escalateAfterDays: null,
  approval: false,
  reviewer: 'approvers' as const,
  evidence: [],
  captures: [],
  onComplete: null,
  reports: [],
  active: true,
};

describe('task template checks', () => {
  it('accepts a sound template', () => {
    expect(() => checkTaskTemplate(base, known)).not.toThrow();
  });

  it('refuses a loop, an unknown wait and an unknown role', () => {
    expect(() =>
      checkTaskTemplate({ ...base, key: 'survey', dependsOn: ['design'] }, known),
    ).toThrow(/circle/);
    expect(() => checkTaskTemplate({ ...base, dependsOn: ['nope'] }, known)).toThrow(/existing/);
    expect(() => checkTaskTemplate({ ...base, roleKey: 'pilot' }, known)).toThrow(/role/);
  });

  it('refuses a message a task cannot fill, or approval timing without approval', () => {
    expect(() => checkTaskTemplate({ ...base, messageKey: 'payment_link' }, known)).toThrow(
      /cannot fill/,
    );
    expect(() => checkTaskTemplate({ ...base, notifyEvent: 'approved' }, known)).toThrow(
      /approval/,
    );
  });

  it('never lets an internal task message the customer, or use the team title', () => {
    expect(() => checkTaskTemplate({ ...base, customerVisible: false }, known)).toThrow(/internal/);
    expect(() => checkTaskTemplate({ ...base, customerTitle: '  ' }, known)).toThrow(
      /customer should read/,
    );
    expect(() =>
      checkTaskTemplate({ ...base, notifyCustomer: false, customerVisible: false }, known),
    ).not.toThrow();
  });

  it('links only a known report or a folder customers see, in a message with a link', () => {
    const linked = { ...base, messageKey: 'project_update_link' };
    expect(() => checkTaskTemplate({ ...linked, attachment: 'report:wcr' }, known)).not.toThrow();
    expect(() =>
      checkTaskTemplate({ ...linked, attachment: 'document:warranty' }, known),
    ).not.toThrow();
    expect(() => checkTaskTemplate({ ...linked, attachment: 'document:vendor' }, known)).toThrow(
      /cannot see/,
    );
    expect(() => checkTaskTemplate({ ...linked, attachment: 'report:nope' }, known)).toThrow(
      /report/,
    );
    expect(() => checkTaskTemplate(linked, known)).toThrow(/needs a link/);
    expect(() => checkTaskTemplate({ ...base, attachment: 'report:wcr' }, known)).toThrow(
      /no place for a link/,
    );
  });
});
