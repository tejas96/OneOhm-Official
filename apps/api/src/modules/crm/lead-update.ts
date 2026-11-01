import type { LeadDetail } from '@oneohm/api-contracts';
import { type LeadLostReason, type LeadStage, lostLeadProblem } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';
import type { Patch } from '../../common/patch';
import { LOST_REASON_LABEL } from './lead-labels';

const CLOSED: LeadStage[] = ['won', 'lost'];

export type LeadPatch = Patch<{
  stage: LeadStage;
  stepKey: string;
  ownerUserId: string | null;
  nextActionOn: string | null;
  nextActionNote: string | null;
  lostReasonKey: LeadLostReason | null;
  lostReason: string | null;
  revisitOn: string | null;
  estimatedWp: number | null;
}>;

export const isOpenStage = (stage: LeadStage) => !CLOSED.includes(stage);

/** An open lead keeps a follow-up date and an owner (PRD 3.3: never silent, never orphaned). */
export function assertOpenLeadComplete(
  current: LeadDetail,
  patch: LeadPatch,
  stage: LeadStage,
): void {
  if (!isOpenStage(stage)) return;
  const nextActionOn = patch.nextActionOn === undefined ? current.nextActionOn : patch.nextActionOn;
  if (!nextActionOn) {
    throw invalid('An open lead needs a next action date.', {
      nextActionOn: 'Choose when to follow up.',
    });
  }
  if (patch.ownerUserId === null) {
    throw invalid('An open lead needs an owner.', { ownerUserId: 'Pick who follows it up.' });
  }
}

/**
 * The lost-lead columns for this change: a checked reason and revisit day when the lead
 * is lost (or stays lost with a new revisit day), and everything cleared on reopening.
 */
export function lostColumns(
  current: LeadDetail,
  patch: LeadPatch,
  stage: LeadStage,
  today: string,
): Pick<LeadPatch, 'lostReasonKey' | 'lostReason' | 'revisitOn'> {
  if (stage !== 'lost') {
    return current.stage === 'lost'
      ? { lostReasonKey: null, lostReason: null, revisitOn: null }
      : {};
  }
  const reasonKey = patch.lostReasonKey === undefined ? current.lostReasonKey : patch.lostReasonKey;
  const reasonText = patch.lostReason === undefined ? current.lostReason : patch.lostReason;
  const revisitOn = patch.revisitOn === undefined ? current.revisitOn : patch.revisitOn;
  const changedRevisit = patch.revisitOn !== undefined && patch.revisitOn !== current.revisitOn;
  const problem = lostLeadProblem({
    reasonKey,
    reasonText,
    // A revisit day already on file may have passed; only a new one must be in the future.
    revisitOn: current.stage === 'lost' && !changedRevisit ? null : revisitOn,
    today,
  });
  if (problem) throw invalid(problem.message, { [problem.field]: problem.message });
  return { lostReasonKey: reasonKey, lostReason: reasonText?.trim() || null, revisitOn };
}

/** The history line for a lead marked lost: why, and when to try again. */
export function lostNote(columns: Pick<LeadPatch, 'lostReasonKey' | 'lostReason' | 'revisitOn'>) {
  const label = columns.lostReasonKey ? LOST_REASON_LABEL[columns.lostReasonKey] : 'Other';
  const words = columns.lostReason ? ` (${columns.lostReason})` : '';
  const revisit = columns.revisitOn ? ` Try again on ${columns.revisitOn}.` : '';
  return `Reason: ${label}${words}.${revisit}`;
}
