/** Settings → Visits & bookings: how long a visit takes, when it can start and who may book. */
export interface VisitSettings {
  /** Length of one visit including travel, in minutes. */
  readonly visitMinutes: number;
  /** Start times a visit can have, "HH:MM", earliest first. */
  readonly slotStarts: readonly string[];
  /** Open visits one person can hold at the same slot. */
  readonly visitsPerSlot: number;
  /** A customer may book a slot only when it starts at least this many hours from now. */
  readonly customerNoticeHours: number;
  /** Staff may book a visit for later today. */
  readonly staffMayBookToday: boolean;
  /** How many days ahead a visit can be booked. */
  readonly daysAhead: number;
  /** Days listed at a time in the WhatsApp picker (the list has room for 9 and the talk row). */
  readonly daysShown: number;
  /** A time the customer picks is booked at once, without a staff confirm. */
  readonly autoConfirmCustomerPicks: boolean;
  readonly reminders: {
    /** The customer is reminded the working day before, at this time ("HH:MM"). */
    readonly dayBeforeAt: string;
    /** And this many hours before the visit; 0 = no such reminder. */
    readonly hoursBefore: number;
    /** On the visit day, the visitor is alerted at this time if the customer has not confirmed. */
    readonly notConfirmedAlertAt: string;
  };
  /** A visit is missed when this many minutes pass after its end without being marked done. */
  readonly missedAfterMinutes: number;
  /** Who does a lead's survey: its owner, or the owner and then anyone free in the city. */
  readonly leadSurveyVisitor: 'owner' | 'owner_then_team';
}

export const DEFAULT_VISIT_SETTINGS: VisitSettings = {
  visitMinutes: 90,
  slotStarts: ['10:00', '11:30', '14:00', '15:30', '17:00'],
  visitsPerSlot: 1,
  customerNoticeHours: 3,
  staffMayBookToday: true,
  daysAhead: 14,
  daysShown: 9,
  autoConfirmCustomerPicks: true,
  reminders: { dayBeforeAt: '17:00', hoursBefore: 2, notConfirmedAlertAt: '09:30' },
  missedAfterMinutes: 120,
  leadSurveyVisitor: 'owner_then_team',
};

/** Saved visit settings over the defaults, including the reminders saved before a field existed. */
export function visitSettingsWithDefaults(saved: Partial<VisitSettings> | null | undefined) {
  const base = DEFAULT_VISIT_SETTINGS;
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    slotStarts: [...(saved.slotStarts ?? base.slotStarts)],
    reminders: { ...base.reminders, ...saved.reminders },
  } satisfies VisitSettings;
}
