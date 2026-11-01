/** The journey every project walks, survey to subsidy. */
export const EPC_STAGES = [
  'survey',
  'design',
  'material',
  'installation',
  'commissioning',
  'net_metering',
  'subsidy',
] as const;
export type EpcStage = (typeof EPC_STAGES)[number];

/** Who a piece of work is waiting on. Only internal time counts against people. */
export const WAITING_PARTIES = ['internal', 'customer', 'bank', 'discom'] as const;
export type WaitingParty = (typeof WAITING_PARTIES)[number];

export const PROJECT_TYPES = ['residential', 'society', 'commercial'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const LEAD_STAGES = [
  'new',
  'contacted',
  'survey_scheduled',
  'quoted',
  'won',
  'lost',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_SOURCES = [
  'manual',
  'website',
  'whatsapp',
  'employee',
  'reseller',
  'referral',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export function stageIndex(stage: EpcStage): number {
  return EPC_STAGES.indexOf(stage);
}
