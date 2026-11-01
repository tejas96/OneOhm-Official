import { task } from './task-library-helpers';
import type { TaskTemplate } from './task-template';

/** The facts every survey records: the budget check re-prices the quote with them. */
export const SURVEY_FACT_KEYS: readonly string[] = [
  'site_floors',
  'structure_type',
  'dc_cable_meters',
  'ac_cable_meters',
];

/** Shared by every survey variant: a manager verifies it before the budget locks (PRD 3.4). */
const survey = {
  stage: 'survey',
  roleKey: 'execution',
  offsetDays: 0,
  dependsOn: [],
  customerVisible: true,
  notifyCustomer: true,
  approval: true,
  evidence: ['photo', 'measurement', 'checklist'],
  captures: SURVEY_FACT_KEYS,
} as const;

/**
 * The site survey, one per kind of site (PRD 3.4 "residential, housing society,
 * commercial, rooftop and ground-mount templates"), plus the commercial-only papers.
 * Exactly one survey applies to a project.
 */
export const SURVEY_TASKS: readonly TaskTemplate[] = [
  task({
    ...survey,
    key: 'site_survey',
    title: 'Site survey and measurements',
    durationDays: 2,
    when: { projectTypes: ['residential'], groundMount: false },
  }),
  task({
    ...survey,
    key: 'site_survey_society',
    description:
      'Visit the society, measure the terrace and cable route, check the common meter and shade, and take photos.',
    title: 'Society site survey: terrace, common meter and cable route',
    durationDays: 3,
    when: { projectTypes: ['society'], groundMount: false },
  }),
  task({
    ...survey,
    key: 'site_survey_commercial',
    description:
      'Visit the site, measure the roof, note the connected load and LT panel, check shade, and take photos.',
    title: 'Commercial site survey: roof, load and electrical panel',
    durationDays: 3,
    when: { projectTypes: ['commercial'], groundMount: false },
  }),
  task({
    ...survey,
    key: 'site_survey_ground',
    description:
      'Measure the land and cable route to the meter, check soil, shade and access, and take photos.',
    title: 'Ground-mount site survey: land, soil and cable route',
    durationDays: 3,
    when: { groundMount: true },
  }),
  task({
    key: 'commercial_documents',
    description:
      'Collect the GST certificate, ownership or lease NOC and the authorised signatory’s letter.',
    title: 'Collect company papers: GST certificate, ownership or lease NOC, signatory letter',
    stage: 'survey',
    roleKey: 'liaisoning',
    offsetDays: 0,
    durationDays: 5,
    dependsOn: [],
    when: { projectTypes: ['commercial'] },
    waitingParty: 'customer',
    evidence: ['document'],
  }),
  task({
    key: 'structural_stability',
    description: 'Get a structural engineer’s certificate that the roof can carry the system.',
    title: 'Structural stability certificate for the roof',
    stage: 'design',
    roleKey: 'execution',
    offsetDays: 0,
    durationDays: 3,
    dependsOn: ['site_survey_commercial'],
    when: { projectTypes: ['commercial'], groundMount: false },
    evidence: ['document'],
  }),
];

/** Template keys of the survey variants, for code that treats every survey alike. */
export const SURVEY_TEMPLATE_KEYS: readonly string[] = SURVEY_TASKS.filter(
  (template) => template.stage === 'survey' && template.captures.length > 0,
).map((template) => template.key);
