import { task } from './task-library-helpers';
import type { TaskTemplate } from './task-template';

/**
 * DISCOMs other than MSEDCL (PRD 3.16): each gets the same plain net-metering track
 * with its own code, so its projects reach "operational". Owners change any step in
 * Settings → Task templates.
 */
export const OTHER_DISCOMS = [
  { code: 'TATA', name: 'Tata Power' },
  { code: 'ADANI', name: 'Adani Electricity' },
  { code: 'BEST', name: 'BEST' },
] as const;

const prefix = (code: string) => code.toLowerCase();

/** Application and sanction: early, beside MSEDCL's own. */
function earlySteps(code: string, name: string): TaskTemplate[] {
  const key = prefix(code);
  const when = { discomCodes: [code] };
  return [
    task({
      key: `${key}_application`,
      title: `Apply for net metering with ${name}`,
      description: `Apply to ${name} for net metering and save the application number.`,
      stage: 'net_metering',
      roleKey: 'liaisoning',
      offsetDays: 1,
      durationDays: 2,
      dependsOn: ['electricity_details'],
      when,
      customerVisible: true,
      notifyCustomer: true,
      evidence: ['document'],
      captures: ['application_number'],
    }),
    task({
      key: `${key}_sanction`,
      title: `${name} sanction for net metering`,
      description: `Follow up with ${name} until net metering is sanctioned and attach the letter.`,
      stage: 'net_metering',
      roleKey: 'liaisoning',
      offsetDays: 0,
      durationDays: 10,
      dependsOn: [`${key}_application`],
      when,
      waitingParty: 'discom',
      evidence: ['document'],
      captures: ['sanction_number', 'sanction_date'],
    }),
  ];
}

/** Inspection and the net meter: after commissioning, beside MSEDCL's own. */
function lateSteps(code: string, name: string): TaskTemplate[] {
  const key = prefix(code);
  const when = { discomCodes: [code] };
  return [
    task({
      key: `${key}_inspection`,
      title: `${name} inspection`,
      description: `Be on site for the ${name} inspection and keep the report.`,
      stage: 'net_metering',
      roleKey: 'liaisoning',
      offsetDays: 0,
      durationDays: 5,
      dependsOn: [`${key}_sanction`, 'testing_commissioning'],
      when,
      waitingParty: 'discom',
      customerVisible: true,
      notifyCustomer: true,
      evidence: ['document'],
    }),
    task({
      key: `${key}_net_meter`,
      title: `Net meter installed by ${name}`,
      description: `Confirm ${name} has fitted the net meter and take a photo of it.`,
      stage: 'net_metering',
      roleKey: 'liaisoning',
      offsetDays: 0,
      durationDays: 5,
      dependsOn: [`${key}_inspection`],
      when,
      waitingParty: 'discom',
      customerVisible: true,
      notifyCustomer: true,
      evidence: ['photo'],
      onComplete: 'project_operational',
    }),
  ];
}

export const OTHER_DISCOM_EARLY_TASKS: readonly TaskTemplate[] = OTHER_DISCOMS.flatMap(
  ({ code, name }) => earlySteps(code, name),
);

export const OTHER_DISCOM_LATE_TASKS: readonly TaskTemplate[] = OTHER_DISCOMS.flatMap(
  ({ code, name }) => lateSteps(code, name),
);

/** The steps that make a project operational on each of these DISCOMs. */
export const OTHER_DISCOM_NET_METER_KEYS: readonly string[] = OTHER_DISCOMS.map(
  ({ code }) => `${prefix(code)}_net_meter`,
);

/** The customer's words for these steps (PRD 5.2), as for MSEDCL's own. */
export const OTHER_DISCOM_CUSTOMER_TITLES: Readonly<Record<string, string>> = Object.fromEntries(
  OTHER_DISCOMS.flatMap(({ code }) => [
    [`${prefix(code)}_application`, 'Net-meter application filed with the electricity board'],
    [`${prefix(code)}_inspection`, 'Electricity board inspection'],
    [`${prefix(code)}_net_meter`, 'Net meter fitted'],
  ]),
);
