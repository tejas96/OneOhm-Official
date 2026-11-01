import { ACCOUNT, type LedgerAccountCode } from './ledger-accounts';
import type { JournalLine } from './ledger-postings';

/**
 * Cash and cheques collected for a project, until they are in the bank (PRD 3.11).
 * Cash: in hand → deposited. Cheque: in hand → deposited → cleared, or bounced.
 */
export const HANDLING_STATUSES = ['in_hand', 'deposited', 'cleared', 'bounced'] as const;
export type HandlingStatus = (typeof HANDLING_STATUSES)[number];
export type HandledMethod = 'cash' | 'cheque';

export const isHandledMethod = (method: string): method is HandledMethod =>
  method === 'cash' || method === 'cheque';

/** Cash held longer than this many days is flagged to the collector and finance. */
export const CASH_HELD_ALERT_DAYS = 3;

/** Only money still in someone's hands can go on a deposit slip. */
export const canDeposit = (status: HandlingStatus): boolean => status === 'in_hand';

/** A deposited cheque either clears into the bank or bounces. */
export const canSettleCheque = (method: HandledMethod, status: HandlingStatus): boolean =>
  method === 'cheque' && (status === 'in_hand' || status === 'deposited');

/** Where the money sits in the books right now. */
export function moneyAccountNow(method: HandledMethod, status: HandlingStatus): LedgerAccountCode {
  if (method === 'cash') return status === 'in_hand' ? ACCOUNT.cash : ACCOUNT.bank;
  return status === 'cleared' ? ACCOUNT.bank : ACCOUNT.chequesInHand;
}

/** Cash paid into the bank: it leaves "Cash in hand". */
export function cashDepositPosting(cashPaise: number): JournalLine[] {
  if (cashPaise <= 0) return [];
  return [
    { account: ACCOUNT.bank, debitPaise: cashPaise, creditPaise: 0 },
    { account: ACCOUNT.cash, debitPaise: 0, creditPaise: cashPaise },
  ];
}

/** A cheque cleared: the money is now in the bank. */
export function chequeClearedPosting(amountPaise: number): JournalLine[] {
  return [
    { account: ACCOUNT.bank, debitPaise: amountPaise, creditPaise: 0 },
    { account: ACCOUNT.chequesInHand, debitPaise: 0, creditPaise: amountPaise },
  ];
}

/** Whole days between receiving the money and `today` (both YYYY-MM-DD). */
export function daysHeld(receivedOn: string, today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${receivedOn}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Deposit slip number for the Indian financial year, e.g. DEP/2026-27/0003. */
export function depositNumber(depositedOn: string, sequence: number): string {
  const year = Number(depositedOn.slice(0, 4));
  const month = Number(depositedOn.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  const end = String((start + 1) % 100).padStart(2, '0');
  return `DEP/${start}-${end}/${String(sequence).padStart(4, '0')}`;
}
