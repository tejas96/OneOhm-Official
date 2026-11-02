import type { ExtraLineInput, ProjectChangeInput, QuotationInput } from '@oneohm/api-contracts';
import { inverterPicks, samePicks } from '@oneohm/domain';
import {
  type InverterRow,
  picksFromRows,
  rowsFromInput,
} from '@/features/quotations/inverter-rows-state';

/** What "Change scope" edits, starting from the accepted quotation. */
export interface ChangeDraft {
  readonly targetKw: string;
  readonly panelProductId: string;
  /** One row per inverter model with how many. */
  readonly inverters: readonly InverterRow[];
  readonly batteryProductId: string | null;
  readonly structureType: QuotationInput['structureType'];
  /** Lines added by this change; the accepted ones stay as they are. */
  readonly newExtras: readonly ExtraLineInput[];
  readonly reason: string;
}

export function draftFrom(accepted: QuotationInput): ChangeDraft {
  return {
    targetKw: String(accepted.targetWp / 1000),
    panelProductId: accepted.panelProductId,
    inverters: rowsFromInput(accepted),
    batteryProductId: accepted.batteryProductId ?? null,
    structureType: accepted.structureType,
    newExtras: [],
    reason: '',
  };
}

/**
 * The body the API takes; null while the size is not a number or an inverter row is not
 * complete yet. The preview passes no
 * reason (a fixed word stands in), so typing the reason does not price again.
 */
export function changeBody(
  accepted: QuotationInput,
  draft: Omit<ChangeDraft, 'reason'>,
  reason = 'Preview',
): ProjectChangeInput | null {
  const kw = Number(draft.targetKw);
  const inverters = picksFromRows(draft.inverters);
  if (!Number.isFinite(kw) || kw <= 0 || !inverters) return null;
  return {
    targetWp: Math.round(kw * 1000),
    panelProductId: draft.panelProductId,
    inverters,
    batteryProductId: draft.batteryProductId,
    structureType: draft.structureType,
    extras: [...(accepted.extras ?? []), ...draft.newExtras],
    reason: reason.trim(),
  };
}

/** True when the draft asks for something different from the accepted quotation. */
export function draftChanges(accepted: QuotationInput, draft: ChangeDraft): boolean {
  const body = changeBody(accepted, draft);
  if (!body) return false;
  return (
    body.targetWp !== accepted.targetWp ||
    body.panelProductId !== accepted.panelProductId ||
    !samePicks(body.inverters, inverterPicks(accepted)) ||
    body.batteryProductId !== (accepted.batteryProductId ?? null) ||
    body.structureType !== accepted.structureType ||
    draft.newExtras.length > 0
  );
}
