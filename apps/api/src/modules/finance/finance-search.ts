import {
  customerInvoices,
  customers,
  journalEntries,
  paymentMilestones,
  payments,
  projects,
} from '@oneohm/database';
import { eq, or, type SQL } from 'drizzle-orm';
import { searchWords } from '../../common/paging';
import { matchWords } from '../../common/search-match';

/**
 * Searches for the finance lists, run on the server so they reach every row, not only the
 * page already loaded. Each word must appear somewhere (any order), as on the other lists.
 */

/** Invoices by number, customer, GSTIN or project code (the query joins projects and customers). */
export function invoiceMatch(q: string | undefined): SQL | undefined {
  return matchWords(searchWords(q), {
    text: [customers.name, customerInvoices.customerGstin],
    codes: [customerInvoices.number, projects.code],
  });
}

/** Money received by receipt, customer, project, milestone or the payer's reference. */
export function paymentMatch(q: string | undefined): SQL | undefined {
  return matchWords(searchWords(q), {
    text: [customers.name, paymentMilestones.label, payments.reference],
    codes: [payments.receiptNumber, projects.code],
  });
}

/** "JV-12", "jv12" or "12" as a journal number; null for any other word. */
export function journalNumberOf(word: string): number | null {
  const digits = /^(?:jv)?[-\s#]?(\d{1,9})$/i.exec(word.trim())?.[1];
  return digits ? Number.parseInt(digits, 10) : null;
}

/** Journal entries by number, what they say, or the project they belong to. */
export function journalMatch(q: string | undefined): SQL | undefined {
  const words = searchWords(q);
  if (words.length === 0) return undefined;
  // A lone number is a JV number first, but may also be in a memo ("Invoice 0012").
  const number = words.length === 1 ? journalNumberOf(words[0] ?? '') : null;
  const text = matchWords(words, { text: [journalEntries.memo], codes: [projects.code] });
  return number === null ? text : or(eq(journalEntries.number, number), text);
}
