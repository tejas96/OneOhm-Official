import type { EpcStage, ProjectType, WaitingParty } from '../epc/stages';
import { MILESTONE_TRIGGERS, type MilestoneTrigger } from '../finance/payment-milestones';

/** When a task applies (PRD 3.7). Every listed condition must hold. */
export interface TaskConditions {
  readonly projectTypes?: readonly ProjectType[];
  readonly discomCodes?: readonly string[];
  readonly loan?: boolean;
  readonly battery?: boolean;
  readonly groundMount?: boolean;
  readonly subsidy?: boolean;
  readonly nameChange?: boolean;
}

export const EVIDENCE_KINDS = [
  'photo',
  'document',
  'measurement',
  'checklist',
  'signature',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** What completing a task sets off besides unlocking the next tasks. */
export type CompletionAction = MilestoneTrigger | 'project_operational';
export const COMPLETION_ACTIONS = [...MILESTONE_TRIGGERS, 'project_operational'] as const;

export interface TaskTemplate {
  readonly key: string;
  readonly title: string;
  readonly stage: EpcStage;
  /** Assigned by role; the engine picks the least-loaded available person. */
  readonly roleKey: string;
  readonly offsetDays: number;
  readonly durationDays: number;
  readonly dependsOn: readonly string[];
  readonly when?: TaskConditions;
  /** Who the task is usually waiting on once started; DISCOM time is reported separately. */
  readonly waitingParty: WaitingParty;
  readonly customerVisible: boolean;
  readonly notifyCustomer: boolean;
  readonly approval: boolean;
  readonly evidence: readonly EvidenceKind[];
  /** Report facts this task captures (the task requires them as evidence). */
  readonly captures: readonly string[];
  readonly onComplete?: CompletionAction;
  /** Statutory reports that become ready when this task completes. */
  readonly reports?: readonly string[];
}

export interface ProjectFacts {
  readonly projectType: ProjectType;
  readonly discomCode: string;
  readonly loan: boolean;
  readonly battery: boolean;
  readonly groundMount: boolean;
  readonly subsidy: boolean;
  readonly nameChange: boolean;
}

export function appliesTo(conditions: TaskConditions | undefined, facts: ProjectFacts): boolean {
  if (!conditions) return true;
  if (conditions.projectTypes && !conditions.projectTypes.includes(facts.projectType)) return false;
  if (conditions.discomCodes && !conditions.discomCodes.includes(facts.discomCode)) return false;
  const flags = ['loan', 'battery', 'groundMount', 'subsidy', 'nameChange'] as const;
  return flags.every((flag) => conditions[flag] === undefined || conditions[flag] === facts[flag]);
}
