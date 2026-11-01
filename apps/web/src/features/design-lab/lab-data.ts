/**
 * DESIGN PREVIEW ONLY. Extra sample figures for the three command-centre
 * alternatives in the design lab. Not OneOhm business data; deleted together
 * with the lab once a direction is chosen and the API exists.
 */
import type { PillTone } from '@oneohm/design-system/web';
import { rupeesToPaise } from '@oneohm/shared';
import type { AttentionProject, EpcStage, Party } from '../command-center/preview-data';
import { PREVIEW } from '../command-center/preview-data';

export interface StageLoad {
  readonly stage: EpcStage;
  readonly projects: number;
  readonly waiting: number;
  readonly waitingOn: Party | null;
}

/** Live projects in each EPC stage (24 in all). */
export const STAGE_LOAD: readonly StageLoad[] = [
  { stage: 'survey', projects: 5, waiting: 0, waitingOn: null },
  { stage: 'design', projects: 3, waiting: 1, waitingOn: 'customer' },
  { stage: 'material', projects: 4, waiting: 1, waitingOn: 'internal' },
  { stage: 'installation', projects: 6, waiting: 0, waitingOn: null },
  { stage: 'commissioning', projects: 2, waiting: 0, waitingOn: null },
  { stage: 'netMetering', projects: 3, waiting: 2, waitingOn: 'discom' },
  { stage: 'subsidy', projects: 1, waiting: 1, waitingOn: 'bank' },
];

export interface ActionItem {
  readonly id: string;
  readonly tone: PillTone;
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly party: Party;
}

/** What the owner can act on right now, most urgent first. */
export const ACTIONS: readonly ActionItem[] = [
  {
    id: 'a1',
    tone: 'overdue',
    title: 'Final payment is 7 days overdue',
    detail: 'Patil Agro Industries · ₹3.2 L · commissioned 12 days ago',
    action: 'Send reminder',
    party: 'customer',
  },
  {
    id: 'a2',
    tone: 'waiting',
    title: 'Net-meter inspection is 4 days late',
    detail: 'Kulkarni Residence · MSEDCL Sangli · requested 9 days ago',
    action: 'Call MSEDCL',
    party: 'discom',
  },
  {
    id: 'a3',
    tone: 'review',
    title: 'Approve 2 discounts',
    detail: 'Quotations for 3.3 kWp and 5.4 kWp homes · 4% and 6% off',
    action: 'Review',
    party: 'internal',
  },
  {
    id: 'a4',
    tone: 'onTrack',
    title: 'Bank disbursement ready to claim',
    detail: 'Deshmukh Bungalow · SBI · installation proof uploaded',
    action: 'Claim ₹2.1 L',
    party: 'bank',
  },
  {
    id: 'a5',
    tone: 'atRisk',
    title: 'Inverter delivery slipped 3 days',
    detail: 'Shree Ganesh Housing Society · crew booked for Thursday',
    action: 'Reschedule',
    party: 'internal',
  },
];

const MORE_PROJECTS: readonly AttentionProject[] = [
  {
    id: 'OH-2026-034',
    name: 'Deshmukh Bungalow',
    place: 'Kolhapur Road, Sangli',
    kind: 'residential',
    capacityWp: 3300,
    discom: 'MSEDCL',
    tone: 'onTrack',
    toneLabel: 'On track',
    sentence: 'Panels and inverter are up. Earthing and testing tomorrow.',
    currentStage: 'installation',
    stageProgress: 0.75,
    waitingOn: null,
    waitingDays: 0,
    skippedStages: [],
    next: { label: 'Commissioning', date: '2026-11-03' },
  },
  {
    id: 'OH-2026-029',
    name: 'Sai Krupa Apartments',
    place: 'Vishrambag, Sangli',
    kind: 'society',
    capacityWp: 30_000,
    discom: 'MSEDCL',
    tone: 'review',
    toneLabel: 'Design in review',
    sentence: 'Layout shared with the society committee on Friday.',
    currentStage: 'design',
    stageProgress: 0.8,
    waitingOn: 'customer',
    waitingDays: 2,
    skippedStages: [],
    next: { label: 'Design sign-off', date: '2026-11-02' },
  },
  {
    id: 'OH-2026-033',
    name: 'Joshi Clinic',
    place: 'Station Road, Miraj',
    kind: 'commercial',
    capacityWp: 10_000,
    discom: 'MSEDCL',
    tone: 'onTrack',
    toneLabel: 'On track',
    sentence: 'Survey done. Cable run is 18 m longer than the quick quote assumed.',
    currentStage: 'survey',
    stageProgress: 0.9,
    waitingOn: null,
    waitingDays: 0,
    skippedStages: ['subsidy'],
    next: { label: 'Revised quotation', date: '2026-11-04' },
  },
];

/** Every live project shown in the lab: the three that need attention, then three more. */
export const LAB_PROJECTS: readonly AttentionProject[] = [...PREVIEW.projects, ...MORE_PROJECTS];

export const MONEY = {
  collected: PREVIEW.pulse.collectedPaise,
  due: PREVIEW.pulse.duePaise,
  stillDue: PREVIEW.pulse.duePaise - PREVIEW.pulse.collectedPaise,
  receivables: PREVIEW.money.receivables,
  payables: PREVIEW.money.payablesThisWeek,
  advancesThisWeek: rupeesToPaise(640_000),
} as const;
