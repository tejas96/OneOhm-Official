import type { Product } from '@oneohm/api-contracts';
import { suggestInverterMix } from '@oneohm/domain';
import { useEffect, useState } from 'react';

/**
 * What a quick quote is priced for: a property on record, or (propertyId null) a fresh
 * lead or new site, priced from the category and the numbers typed on the phone.
 */
export interface QuoteSite {
  readonly propertyId: string | null;
  readonly leadId: string | null;
  readonly title: string;
  readonly subtitle: string;
  readonly subsidyCategory: 'individual' | 'society' | 'commercial';
  readonly households: number | null;
  readonly floors: number | null;
}

export const SIZE_CHOICES_KW = ['2', '3', '3.3', '5', '7.5', '10'] as const;

/** Parses "5", "5.4" or "5,4" kW into watts-peak; null when not a usable size. */
export function parseKw(value: string): number | null {
  const kw = Number.parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(kw) || kw < 0.5 || kw > 2000) return null;
  return Math.round(kw * 1000);
}

/** Rupees typed by a person into paise (whole rupees only). */
export function rupeesToPaise(value: string): number {
  const rupees = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(rupees) ? rupees * 100 : 0;
}

/**
 * The inverter a quote starts with: the smallest one that carries the array, on-grid
 * before hybrid at the same rating. Sales can change it.
 */
export function suggestInverter(inverters: readonly Product[], targetWp: number): Product | null {
  const usable = inverters.filter((product) => product.active && product.ratedW);
  if (usable.length === 0) return null;
  const sorted = [...usable].sort((left, right) => {
    const byRating = (left.ratedW ?? 0) - (right.ratedW ?? 0);
    if (byRating !== 0) return byRating;
    return Number(/hybrid/i.test(left.name)) - Number(/hybrid/i.test(right.name));
  });
  return sorted.find((product) => (product.ratedW ?? 0) >= targetWp * 0.9) ?? sorted.at(-1) ?? null;
}

/** One inverter row as typed on the phone: a model (or none yet) and how many. */
export interface InverterRow {
  readonly productId: string | null;
  readonly quantity: string;
}

/**
 * The inverters a quote starts with: one that carries the array, else the largest as
 * many times as fill it plus one smaller (120 kW gets 2 × 50 + 25 kW). Sales can change them.
 */
export function suggestInverterRows(
  inverters: readonly Product[],
  targetWp: number,
): InverterRow[] {
  // On-grid before hybrid at the same rating, as for one inverter.
  const models = inverters
    .filter((product) => product.active && product.ratedW)
    .sort((left, right) => Number(/hybrid/i.test(left.name)) - Number(/hybrid/i.test(right.name)))
    .map((product) => ({ id: product.id, ratedW: product.ratedW ?? 0 }));
  return suggestInverterMix(models, targetWp, 1 / 0.9).map((pick) => ({
    productId: pick.productId,
    quantity: String(pick.quantity),
  }));
}

/** The picks for the API, or null while a row has no model or a whole count from 1 to 50. */
export function inverterPicksOf(
  rows: readonly InverterRow[],
): { productId: string; quantity: number }[] | null {
  if (rows.length === 0 || rows.length > 10) return null;
  const picks: { productId: string; quantity: number }[] = [];
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (!row.productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
    picks.push({ productId: row.productId, quantity });
  }
  return picks;
}

/** The value after it has stopped changing for `delayMs` (live preview without flooding). */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
