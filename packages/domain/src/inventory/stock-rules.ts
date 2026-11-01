import type { LineCategory } from '../pricing/quote-pricing';

/**
 * Stock rules (PRD 3.10): stock never goes negative, reserved never exceeds on hand,
 * receipts never exceed what was ordered, and serialised items carry one serial each.
 */
export interface StockLevel {
  readonly onHand: number;
  readonly reserved: number;
}

export interface StockChange {
  readonly onHand: number;
  readonly reserved: number;
}

export type StockProblem = 'negative_stock' | 'negative_reserved' | 'reserved_exceeds_stock';

/** Quantities are compared to 3 decimals (cable in metres) so float noise never blocks. */
const EPSILON = 0.0005;
export const roundQuantity = (value: number): number => Math.round(value * 1000) / 1000;

/** The level after a change, or the rule it would break. */
export function applyStockChange(
  level: StockLevel,
  change: StockChange,
): { readonly level: StockLevel } | { readonly problem: StockProblem } {
  const onHand = roundQuantity(level.onHand + change.onHand);
  const reserved = roundQuantity(level.reserved + change.reserved);
  if (onHand < -EPSILON) return { problem: 'negative_stock' };
  if (reserved < -EPSILON) return { problem: 'negative_reserved' };
  if (reserved - onHand > EPSILON) return { problem: 'reserved_exceeds_stock' };
  return { level: { onHand: Math.max(0, onHand), reserved: Math.max(0, reserved) } };
}

export const available = (level: StockLevel): number =>
  roundQuantity(Math.max(0, level.onHand - level.reserved));

/** Panels, inverters and batteries are tracked unit by unit (warranty, DCR, WCR). */
export const SERIALISED_CATEGORIES: readonly LineCategory[] = ['panel', 'inverter', 'battery'];
export const isSerialised = (category: LineCategory): boolean =>
  SERIALISED_CATEGORIES.includes(category);

export type ReceiptProblem = 'not_positive' | 'over_received' | 'not_whole';

/** Whether `quantity` more can be received on a line ordered for `ordered`. */
export function checkReceipt(
  line: { readonly ordered: number; readonly received: number; readonly serialised: boolean },
  quantity: number,
): ReceiptProblem | null {
  if (!(quantity > EPSILON)) return 'not_positive';
  if (line.serialised && !Number.isInteger(quantity)) return 'not_whole';
  if (roundQuantity(line.received + quantity) - line.ordered > EPSILON) return 'over_received';
  return null;
}

export type SerialProblem = 'count_mismatch' | 'blank' | 'duplicate';

/** Serials for a receipt line: one per unit, none blank, no repeats. */
export function checkSerials(
  quantity: number,
  serials: readonly string[],
): { readonly serials: string[] } | { readonly problem: SerialProblem } {
  const cleaned = serials.map((serial) => serial.trim().toUpperCase());
  if (cleaned.some((serial) => serial.length === 0)) return { problem: 'blank' };
  if (new Set(cleaned).size !== cleaned.length) return { problem: 'duplicate' };
  if (cleaned.length !== quantity) return { problem: 'count_mismatch' };
  return { serials: cleaned };
}

/** Splits pasted serials (one per line, or separated by commas or spaces). */
export const parseSerials = (text: string): string[] =>
  text
    .split(/[\s,;]+/)
    .map((serial) => serial.trim())
    .filter((serial) => serial.length > 0);

export type PurchaseOrderStage = 'sent' | 'partly_received' | 'received';

/** A sent PO's status from what has arrived so far. */
export function receiptStage(
  lines: readonly { readonly ordered: number; readonly received: number }[],
): PurchaseOrderStage {
  const anything = lines.some((line) => line.received > EPSILON);
  if (!anything) return 'sent';
  const all = lines.every((line) => line.ordered - line.received <= EPSILON);
  return all ? 'received' : 'partly_received';
}

export interface Shortage {
  readonly productId: string;
  readonly needed: number;
  readonly available: number;
}

/** What a reservation cannot cover from stock that is free to use. */
export function shortages(
  needs: readonly { readonly productId: string; readonly quantity: number }[],
  free: ReadonlyMap<string, number>,
): Shortage[] {
  return needs
    .map((need) => ({
      productId: need.productId,
      needed: need.quantity,
      available: free.get(need.productId) ?? 0,
    }))
    .filter((row) => row.needed - row.available > EPSILON);
}
