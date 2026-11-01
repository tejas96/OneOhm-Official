/**
 * DESIGN PREVIEW ONLY. Sample figures so the command centre's design can be judged
 * before the API exists. This is not OneOhm business data; the page shows a
 * "sample figures" label while it is used, and this file is deleted when the
 * command centre reads from the API.
 */
import type { PillTone } from '@oneohm/design-system/web';
import { rupeesToPaise } from '@oneohm/shared';

/** The EPC journey every project walks (message keys under `stages`). */
export const EPC_STAGES = [
  'survey',
  'design',
  'material',
  'installation',
  'commissioning',
  'netMetering',
  'subsidy',
] as const;
export type EpcStage = (typeof EPC_STAGES)[number];

export type Party = 'internal' | 'customer' | 'bank' | 'discom';

export interface AttentionProject {
  readonly id: string;
  readonly name: string;
  readonly place: string;
  readonly kind: 'residential' | 'society' | 'commercial';
  readonly capacityWp: number;
  readonly discom: string;
  readonly tone: PillTone;
  readonly toneLabel: string;
  readonly sentence: string;
  readonly currentStage: EpcStage;
  readonly stageProgress: number;
  readonly waitingOn: Party | null;
  readonly waitingDays: number;
  readonly skippedStages: readonly EpcStage[];
  readonly next: { readonly label: string; readonly date: string };
}

export const PREVIEW = {
  pulse: {
    healthScore: 82,
    collectedPaise: rupeesToPaise(1_840_000),
    duePaise: rupeesToPaise(2_610_000),
    installedWp: 46_800,
    commissioned: 9,
  },
  projects: [
    {
      id: 'OH-2026-031',
      name: 'Kulkarni Residence',
      place: 'Vishrambag, Sangli',
      kind: 'residential',
      capacityWp: 5400,
      discom: 'MSEDCL',
      tone: 'waiting',
      toneLabel: 'Waiting on DISCOM',
      sentence: 'Net-meter inspection was requested 9 days ago. MSEDCL Sangli usually takes 5.',
      currentStage: 'netMetering',
      stageProgress: 0.45,
      waitingOn: 'discom',
      waitingDays: 9,
      skippedStages: [],
      next: { label: 'Net meter installed', date: '2026-11-06' },
    },
    {
      id: 'OH-2026-027',
      name: 'Shree Ganesh Housing Society',
      place: 'Miraj',
      kind: 'society',
      capacityWp: 48_000,
      discom: 'MSEDCL',
      tone: 'atRisk',
      toneLabel: 'At risk',
      sentence: 'Inverter delivery slipped 3 days. The installation crew is booked for Thursday.',
      currentStage: 'material',
      stageProgress: 0.7,
      waitingOn: 'internal',
      waitingDays: 3,
      skippedStages: [],
      next: { label: 'Installation starts', date: '2026-11-05' },
    },
    {
      id: 'OH-2026-019',
      name: 'Patil Agro Industries',
      place: 'Kupwad MIDC',
      kind: 'commercial',
      capacityWp: 25_000,
      discom: 'MSEDCL',
      tone: 'overdue',
      toneLabel: 'Payment overdue',
      sentence: 'Commissioned 12 days ago. The final payment of ₹3.2 L is 7 days overdue.',
      currentStage: 'netMetering',
      stageProgress: 0.6,
      waitingOn: 'customer',
      waitingDays: 7,
      skippedStages: ['subsidy'],
      next: { label: 'Final payment', date: '2026-10-25' },
    },
  ] satisfies readonly AttentionProject[],
  waitingDays: { internal: 18, customer: 11, bank: 9, discom: 34 } satisfies Record<Party, number>,
  money: {
    receivables: { customer: rupeesToPaise(2_140_000), bank: rupeesToPaise(1_120_000) },
    payablesThisWeek: { vendors: rupeesToPaise(560_000), contractors: rupeesToPaise(330_000) },
    weeklyCollections: [3.1, 4.2, 2.8, 5.6, 4.9, 6.3, 5.1, 7.4],
  },
  pipeline: { leads: 38, surveys: 21, quotations: 17, accepted: 7 },
} as const;
