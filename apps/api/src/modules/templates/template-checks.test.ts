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
  customerTitle: null,
  notifyManager: false,
  approval: false,
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
});
