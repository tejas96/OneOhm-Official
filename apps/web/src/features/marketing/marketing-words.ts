import type { CampaignCard, CampaignNumbers } from '@oneohm/api-contracts';
import type { CampaignChannel, CampaignGoal, CampaignLook } from '@oneohm/domain';
import { type AdProvider, paidProviders, splitBudget } from '@oneohm/domain';

/** The colour family of each plain-words status (design-system pill tones). */
export const LOOK_TONE = {
  starting: 'waiting',
  in_review: 'review',
  live: 'onTrack',
  paused: 'atRisk',
  stopped: 'neutral',
  scheduled: 'waiting',
  posted: 'done',
  needs_attention: 'overdue',
} as const satisfies Record<CampaignLook, string>;

export type ConnectionWord = 'connected' | 'in_review' | 'needs_attention' | 'not_connected';

/** Pill tone for a connection's one-word state. */
export const CONNECTION_TONE = {
  connected: 'onTrack',
  in_review: 'review',
  needs_attention: 'overdue',
  not_connected: 'neutral',
} as const satisfies Record<ConnectionWord, string>;

export type NumberKey = 'spent' | 'leads' | 'sales' | 'costPerSale';

export interface CardNumber {
  readonly key: NumberKey;
  /** Null shows a dash: nothing has happened yet, which is not the same as zero. */
  readonly value: number | null;
  readonly money: boolean;
}

/** The four numbers a campaign card shows; a dash where there is nothing yet. */
export function cardNumbers(numbers: CampaignNumbers): readonly CardNumber[] {
  return [
    { key: 'spent', value: numbers.spentPaise > 0 ? numbers.spentPaise : null, money: true },
    { key: 'leads', value: numbers.leads > 0 ? numbers.leads : null, money: false },
    { key: 'sales', value: numbers.sales > 0 ? numbers.sales : null, money: false },
    { key: 'costPerSale', value: numbers.costPerSalePaise, money: true },
  ];
}

/** The button a preview ad shows; a post has none. */
export function previewButton(goal: CampaignGoal): 'whatsapp' | 'quote' | null {
  if (goal === 'chats') return 'whatsapp';
  if (goal === 'lead_form') return 'quote';
  return null;
}

export interface BudgetBreakdown {
  /** About thirty days of the daily budget, in paise. */
  readonly monthlyPaise: number;
  readonly parts: readonly { readonly provider: AdProvider; readonly paise: number }[];
}

/** The monthly figure and each paid platform's share, or null when nothing is paid. */
export function budgetBreakdown(
  dailyPaise: number,
  goal: CampaignGoal,
  channels: readonly CampaignChannel[],
): BudgetBreakdown | null {
  const providers = paidProviders(goal, channels);
  if (providers.length === 0 || dailyPaise <= 0) return null;
  const split = splitBudget(dailyPaise, providers);
  return {
    monthlyPaise: dailyPaise * 30,
    parts: providers.map((provider) => ({ provider, paise: split[provider] ?? 0 })),
  };
}

/** Rupee text typed in a field ("1,000", "₹500") as paise; 0 when it is not a number. */
export function paiseFromRupeeText(text: string): number {
  const rupees = Number(text.replace(/[₹,\s]/g, ''));
  return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
}

/** Stars as 5 booleans for a rating (rounded to the nearest whole star). */
export function starsOf(rating: number): readonly boolean[] {
  const whole = Math.max(0, Math.min(5, Math.round(rating)));
  return Array.from({ length: 5 }, (_, index) => index < whole);
}

/** Whether a link leaves the app (a top-up page) rather than opening one of its screens. */
export function isOutsideLink(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Days until a date, rounded up; negative once it has passed. */
export function daysUntil(iso: string, now: Date): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

/** A token that expires within this many days gets a warning. */
export const TOKEN_WARNING_DAYS = 10;

export function tokenNeedsWarning(expiresAt: string | null, now: Date): boolean {
  return expiresAt !== null && daysUntil(expiresAt, now) <= TOKEN_WARNING_DAYS;
}

/** The campaign's picture address as the browser loads it. */
export function mediaSrc(path: string | null): string | null {
  return path ? `/api/v1${path}` : null;
}

export type CardAction = 'pause' | 'stop' | 'runAgain';

/** The one-tap actions a card offers, in the order shown. */
export function availableActions(card: Pick<CampaignCard, 'actions'>): readonly CardAction[] {
  const order: readonly CardAction[] = ['pause', 'runAgain', 'stop'];
  return order.filter((action) => card.actions[action]);
}

/** Sample values for a message preview, so the owner reads a real sentence, not {{1}}. */
const SAMPLE_VALUES: Readonly<Record<string, string>> = {
  customer: 'Asha',
  message: 'Get the government subsidy on rooftop solar this month.',
  link: 'g.page/r/your-business/review',
};

/** A template's wording with sample values in place of {{1}}, {{2}}…; the brand fills `company`. */
export function samplePreview(preview: string, fields: readonly string[], brand: string): string {
  return preview.replace(/\{\{(\d+)\}\}/g, (match, index: string) => {
    const field = fields[Number(index) - 1];
    if (!field) return match;
    if (field === 'company') return brand || 'your business';
    return SAMPLE_VALUES[field] ?? match;
  });
}
