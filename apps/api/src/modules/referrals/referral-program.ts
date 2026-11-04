import { type DatabaseExecutor, referralPrograms } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { asc } from 'drizzle-orm';

export type ProgramRow = typeof referralPrograms.$inferSelect;

/** Until the owner saves the programme it is off: nothing is earned by accident. */
export function defaultProgram(): ProgramRow {
  const now = new Date();
  return {
    id: '',
    active: false,
    basis: 'per_referral',
    amountPaise: 0,
    qualifyingEvent: 'advance_paid',
    startsOn: todayIn(),
    budgetPaise: null,
    perCustomerCount: null,
    perCustomerPaise: null,
    eligibleTypes: [],
    shareNumberE164: null,
    updatedByUserId: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** The one programme row, or the off-by-default programme when none is saved yet. */
export async function loadProgram(db: DatabaseExecutor): Promise<ProgramRow & { saved: boolean }> {
  const [row] = await db
    .select()
    .from(referralPrograms)
    .orderBy(asc(referralPrograms.createdAt))
    .limit(1);
  return row ? { ...row, saved: true } : { ...defaultProgram(), saved: false };
}

/** Digits only, with the India code, for a wa.me link. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits.length >= 10 ? digits : null;
}

/** A typed number as E.164: "98765 43210" becomes "+919876543210". */
export function toE164(phone: string | null): string | null {
  const digits = whatsappDigits(phone);
  return digits ? `+${digits}` : null;
}

/**
 * A programme that is on must pay something: switched on with ₹0 it would look live to
 * customers while earning nothing. Field messages, or null when it can be saved.
 */
export function programProblems(input: {
  readonly active: boolean;
  readonly amountPaise: number;
}): Record<string, string> | null {
  if (input.active && input.amountPaise <= 0) {
    return { amountPaise: 'Enter a reward above ₹0, or switch the programme off.' };
  }
  return null;
}
