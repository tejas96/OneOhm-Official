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

/** "16:30" as people in India read it: "4:30 pm". */
export function clockLabel(time: string): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const half = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${half}`;
}
