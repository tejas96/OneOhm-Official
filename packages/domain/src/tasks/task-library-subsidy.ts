import { OTHER_DISCOM_NET_METER_KEYS } from './task-library-discoms';
import { task } from './task-library-helpers';
import type { TaskTemplate } from './task-template';

/** PM Surya Ghar subsidy: apply, inspection on the portal, release (PRD 3.5, 3.17). */
export const SUBSIDY_TASKS: readonly TaskTemplate[] = [
  task({
    key: 'subsidy_application',
    title: 'Apply on the PM Surya Ghar portal',
    stage: 'subsidy',
    roleKey: 'liaisoning',
    offsetDays: 0,
    durationDays: 2,
    dependsOn: ['net_meter_installation', ...OTHER_DISCOM_NET_METER_KEYS, 'dcr_undertaking'],
    when: { subsidy: true },
    customerVisible: true,
    notifyCustomer: true,
    evidence: ['document'],
  }),
  task({
    key: 'subsidy_inspection',
    title: 'Subsidy inspection approved on the portal',
    stage: 'subsidy',
    roleKey: 'liaisoning',
    offsetDays: 0,
    durationDays: 10,
    dependsOn: ['subsidy_application'],
    when: { subsidy: true },
    waitingParty: 'discom',
    customerVisible: true,
    notifyCustomer: true,
    evidence: ['document'],
  }),
  task({
    key: 'subsidy_release',
    title: 'Subsidy released to customer',
    stage: 'subsidy',
    roleKey: 'liaisoning',
    offsetDays: 0,
    durationDays: 30,
    dependsOn: ['subsidy_inspection'],
    when: { subsidy: true },
    waitingParty: 'discom',
    customerVisible: true,
    notifyCustomer: true,
    evidence: ['document'],
  }),
];
