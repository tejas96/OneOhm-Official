import type { CustomerProject } from '@oneohm/api-contracts';
import { MILESTONE } from '@/copy/home';
import { lookup } from '@/i18n/copy';

type Stage = CustomerProject['stages'][number];
type Milestone = CustomerProject['payments']['milestones'][number];

/** Steps that apply to this home, and how many are done. */
export function stepProgress(stages: readonly Stage[]): { done: number; total: number } {
  const applicable = stages.filter((stage) => stage.state !== 'skipped');
  return {
    done: applicable.filter((stage) => stage.state === 'done').length,
    total: applicable.length,
  };
}

/** Running: switched on (commissioning done) or handed over. */
export function isLive(project: CustomerProject): boolean {
  if (project.status === 'operational' || project.status === 'completed') return true;
  return project.stages.some((stage) => stage.stage === 'commissioning' && stage.state === 'done');
}

/** The rating card shows once the system is live and until the customer has rated. */
export function asksForFeedback(project: CustomerProject): boolean {
  return isLive(project) && !project.feedbackGiven;
}

/** A milestone in the customer's words, falling back to OneOhm's title. */
export function milestoneLabel(step: { readonly key: string; readonly title: string }): string {
  return lookup(MILESTONE, step.key) ?? step.title;
}

/** Whole percent of the project price received (0–100). */
export function percentPaid(payments: CustomerProject['payments']): number {
  if (payments.totalPaise <= 0) return 0;
  return Math.min(100, Math.floor((payments.paidPaise * 100) / payments.totalPaise));
}

/** The customer's own share and the bank's (loan projects), each with what is paid. */
export function shareSplit(milestones: readonly Milestone[]) {
  const sum = (payer: Milestone['payer']) => {
    const own = milestones.filter((line) => line.payer === payer);
    return {
      totalPaise: own.reduce((total, line) => total + line.amountPaise, 0),
      paidPaise: own.reduce((total, line) => total + line.paidPaise, 0),
    };
  };
  return { customer: sum('customer'), bank: sum('bank') };
}

/** Digits only, with India's code, for tel: and wa.me links. */
export function dialDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}
