import type { TaskTemplate } from './task-template';

type Draft = Omit<
  TaskTemplate,
  'waitingParty' | 'customerVisible' | 'notifyCustomer' | 'approval' | 'evidence' | 'captures'
> &
  Partial<
    Pick<
      TaskTemplate,
      'waitingParty' | 'customerVisible' | 'notifyCustomer' | 'approval' | 'evidence' | 'captures'
    >
  >;

export const task = (draft: Draft): TaskTemplate => ({
  waitingParty: 'internal',
  customerVisible: false,
  notifyCustomer: false,
  approval: false,
  evidence: [],
  captures: [],
  ...draft,
});

export const MSEDCL = ['MSEDCL'];
