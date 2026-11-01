import type { PillTone } from '@oneohm/design-system/web';
import type { LeadStage } from '@oneohm/domain';

/** How each lead stage reads as a status pill. */
export const STAGE_TONE: Readonly<Record<LeadStage, PillTone>> = {
  new: 'neutral',
  contacted: 'onTrack',
  survey_scheduled: 'onTrack',
  quoted: 'review',
  won: 'done',
  lost: 'blocked',
};

/** Won and lost leads are closed: no follow-up is due on them. */
export function isOpenLead(lead: { readonly stage: LeadStage }): boolean {
  return lead.stage !== 'won' && lead.stage !== 'lost';
}

/** Query keys every lead screen shares, so one change refreshes them all. */
export const leadKeys = {
  all: ['leads'] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
};

/** Kilowatts typed by a person ("3.3") to integer watts-peak; blank stays null. */
export function kwToWp(value: string): number | null {
  const kw = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(kw) && kw > 0 ? Math.round(kw * 1000) : null;
}
