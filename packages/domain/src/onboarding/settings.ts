/**
 * How the WhatsApp onboarding bot greets a stranger and works out an instant estimate.
 * Owners change it in Settings → WhatsApp onboarding; the defaults work as they are.
 */

/** One answer to "how big is your monthly bill?" and the system size it points to. */
export interface BillBand {
  readonly id: string;
  readonly label: string;
  /** The label in the Marathi and Hindi chats; the label is used when left out. */
  readonly labelMr?: string;
  readonly labelHi?: string;
  /** System size to price in watts; null means "too big to price here — an expert does it". */
  readonly targetWp: number | null;
  /**
   * Highest monthly bill (₹) in this band, used when a customer types an amount.
   * null means no upper limit; leaving it out means the band is picked by tapping only.
   */
  readonly maxRupees?: number | null;
}

export interface OnboardingSettings {
  readonly enabled: boolean;
  /** Cities shown as list rows; "Other" is always added. */
  readonly serviceCities: readonly string[];
  /** 2 to 8 bands, smallest bill first. */
  readonly billBands: readonly BillBand[];
  /** What one unit of electricity costs the customer, in paise (800 = ₹8). */
  readonly tariffPaisePerUnit: number;
  /** Units one kW makes in a month. */
  readonly unitsPerKwMonth: number;
  /** Hours of silence before one nudge; 0 = no nudge; at most MAX_NUDGE_AFTER_HOURS. */
  readonly nudgeAfterHours: number;
  /** Optional panel product to use instead of the suggested one. */
  readonly panelProductIds: Partial<Record<'individual' | 'commercial', string>>;
}

export const MIN_BILL_BANDS = 2;
/** WhatsApp lists hold 10 rows; "Back" and "Talk to a person" take two. */
export const MAX_BILL_BANDS = 8;
/** The city list also carries "Other", "Back" and "Talk to a person". */
export const MAX_SERVICE_CITIES = 7;
/**
 * The nudge is a session message, so it must go inside the chat window (23 hours here,
 * inside WhatsApp's 24); a larger wait would also hold back the lead made for a chat that
 * stalls before the city.
 */
export const MAX_NUDGE_AFTER_HOURS = 22;
/** WhatsApp list row titles hold 24 characters. */
export const MAX_ROW_TITLE = 24;

export const DEFAULT_ONBOARDING: OnboardingSettings = {
  enabled: true,
  serviceCities: [],
  billBands: [
    { id: 'up_to_1000', label: 'Up to ₹1,000', targetWp: 1000, maxRupees: 1000 },
    { id: '1000_2000', label: '₹1,000–2,000', targetWp: 2000, maxRupees: 2000 },
    { id: '2000_3000', label: '₹2,000–3,000', targetWp: 3000, maxRupees: 3000 },
    { id: '3000_5000', label: '₹3,000–5,000', targetWp: 5000, maxRupees: 5000 },
    { id: 'over_5000', label: 'Over ₹5,000', targetWp: null, maxRupees: null },
  ],
  tariffPaisePerUnit: 800,
  unitsPerKwMonth: 120,
  nudgeAfterHours: 3,
  panelProductIds: {},
};

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';
const isRowTitle = (value: unknown) =>
  value === undefined || (isText(value) && value.length <= MAX_ROW_TITLE);
const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function isBillBand(value: unknown): value is BillBand {
  if (!value || typeof value !== 'object') return false;
  const band = value as Record<string, unknown>;
  const { targetWp, maxRupees } = band;
  return (
    isText(band.id) &&
    isText(band.label) &&
    band.label.length <= MAX_ROW_TITLE &&
    isRowTitle(band.labelMr) &&
    isRowTitle(band.labelHi) &&
    (targetWp === null || isPositive(targetWp)) &&
    (maxRupees === undefined || maxRupees === null || isPositive(maxRupees))
  );
}

/** Typed amounts are matched in order, so numbers must rise and "no limit" can only be last. */
function areBandsOrdered(bands: readonly BillBand[]): boolean {
  let previous = 0;
  for (const [index, band] of bands.entries()) {
    if (band.maxRupees === null) {
      if (index !== bands.length - 1) return false;
    } else if (band.maxRupees !== undefined) {
      if (band.maxRupees <= previous) return false;
      previous = band.maxRupees;
    }
  }
  return true;
}

function isPanelOverrides(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).every(
    ([key, id]) => (key === 'individual' || key === 'commercial') && isText(id),
  );
}

/** True when the saved onboarding settings are complete and sensible. */
export function isOnboardingSettings(value: unknown): value is OnboardingSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  const bands = s.billBands;
  const cities = s.serviceCities;
  return (
    typeof s.enabled === 'boolean' &&
    Array.isArray(cities) &&
    cities.length <= MAX_SERVICE_CITIES &&
    cities.every((city) => isText(city) && city.length <= MAX_ROW_TITLE) &&
    Array.isArray(bands) &&
    bands.length >= MIN_BILL_BANDS &&
    bands.length <= MAX_BILL_BANDS &&
    bands.every(isBillBand) &&
    areBandsOrdered(bands) &&
    new Set(bands.map((band: BillBand) => band.id)).size === bands.length &&
    isPositive(s.tariffPaisePerUnit) &&
    isPositive(s.unitsPerKwMonth) &&
    typeof s.nudgeAfterHours === 'number' &&
    Number.isFinite(s.nudgeAfterHours) &&
    s.nudgeAfterHours >= 0 &&
    s.nudgeAfterHours <= MAX_NUDGE_AFTER_HOURS &&
    isPanelOverrides(s.panelProductIds)
  );
}
