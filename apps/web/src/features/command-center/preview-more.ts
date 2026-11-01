/**
 * DESIGN PREVIEW ONLY. More sample figures for the command centre (actions, more
 * projects, money). Not OneOhm business data; deleted when the API exists.
 */
import type { PillTone } from '@oneohm/design-system/web';
import { rupeesToPaise } from '@oneohm/shared';
import type { AttentionProject, Party } from './preview-data';
import { PREVIEW } from './preview-data';

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

/** Live projects on the command centre: the three that need attention, then three more. */
export const LIVE_PROJECTS: readonly AttentionProject[] = [...PREVIEW.projects, ...MORE_PROJECTS];

export const MONEY = {
  collected: PREVIEW.pulse.collectedPaise,
  due: PREVIEW.pulse.duePaise,
  stillDue: PREVIEW.pulse.duePaise - PREVIEW.pulse.collectedPaise,
  receivables: PREVIEW.money.receivables,
  payables: PREVIEW.money.payablesThisWeek,
  advancesThisWeek: rupeesToPaise(640_000),
} as const;
