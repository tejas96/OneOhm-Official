import type {
  CostingDetailInput,
  ExtraLineInput,
  Product,
  Property,
  QuotationDetail,
  QuotationInput,
} from '@oneohm/api-contracts';
import { rupeesToPaise } from '@oneohm/shared';
import {
  type InverterRow,
  picksFromRows,
  rowsFromInput,
  suggestInverters,
} from '../inverter-rows-state';

export type SubsidyCategory = QuotationInput['subsidyCategory'];
export type SystemType = QuotationInput['systemType'];
export type StructureType = QuotationInput['structureType'];

/**
 * What the builder form holds. Numbers stay as typed text so a half-typed value
 * ("5.") never jumps; `toInput` turns it into the API's input once it is complete.
 */
export interface BuilderState {
  readonly propertyId: string | null;
  readonly leadId: string | null;
  readonly subsidyCategory: SubsidyCategory;
  readonly households: string;
  readonly systemType: SystemType;
  readonly targetKw: string;
  readonly panelProductId: string | null;
  /** One row per inverter model with how many; the first is the main one. */
  readonly inverters: readonly InverterRow[];
  readonly batteryProductId: string | null;
  readonly structureType: StructureType;
  readonly floors: string;
  readonly distanceKm: string;
  readonly dcCableMeters: string;
  readonly acCableMeters: string;
  readonly discountRupees: string;
  /** Optional items, gifts, site charges and adjustments, each complete as added. */
  readonly extras: readonly ExtraLineInput[];
  /** Set once sales picks a product by hand; until then the builder suggests one. */
  readonly inverterChosen: boolean;
  readonly panelChosen: boolean;
  /** Measured runs, structure, crew and visits; null means the site type's defaults. */
  readonly costing: CostingDetailInput | null;
  /** Set once the distance is typed; until then it follows the site's GPS. */
  readonly distanceTouched: boolean;
}

export const EMPTY_BUILDER: BuilderState = {
  propertyId: null,
  leadId: null,
  subsidyCategory: 'individual',
  households: '',
  systemType: 'on_grid',
  targetKw: '',
  panelProductId: null,
  inverters: [],
  batteryProductId: null,
  structureType: 'rcc_elevated',
  floors: '1',
  distanceKm: '0',
  dcCableMeters: '',
  acCableMeters: '',
  discountRupees: '',
  extras: [],
  inverterChosen: false,
  panelChosen: false,
  costing: null,
  distanceTouched: false,
};

/** Category, households and floors come from the property (PRD 3.5: usually pre-filled). */
export function withProperty(state: BuilderState, property: Property): BuilderState {
  return {
    ...state,
    propertyId: property.id,
    subsidyCategory: property.subsidyCategory,
    households: property.households ? String(property.households) : '',
    floors: String(property.floors),
  };
}

/** A revision starts from the quotation it replaces. */
export function fromQuotation(quotation: QuotationDetail): BuilderState {
  const input = quotation.input;
  return {
    propertyId: input.propertyId,
    leadId: input.leadId ?? null,
    subsidyCategory: input.subsidyCategory,
    households: input.households ? String(input.households) : '',
    systemType: input.systemType,
    targetKw: String(input.targetWp / 1000),
    panelProductId: input.panelProductId,
    inverters: rowsFromInput(input),
    batteryProductId: input.batteryProductId ?? null,
    structureType: input.structureType,
    floors: String(input.floors),
    distanceKm: String(input.distanceKm),
    dcCableMeters: input.dcCableMeters ? String(input.dcCableMeters) : '',
    acCableMeters: input.acCableMeters ? String(input.acCableMeters) : '',
    discountRupees: input.discountPaise ? String(input.discountPaise / 100) : '',
    extras: input.extras ?? [],
    inverterChosen: true,
    panelChosen: true,
    costing: input.costing ?? null,
    distanceTouched: true,
  };
}

const wholeNumber = (text: string): number | null => {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 ? value : null;
};

const positive = (text: string): number | null => {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** The API input, or null while something required is missing or unreadable. */
export function toInput(state: BuilderState): QuotationInput | null {
  const kw = positive(state.targetKw);
  const floors = wholeNumber(state.floors);
  const distanceKm = wholeNumber(state.distanceKm);
  const discount = state.discountRupees.trim() === '' ? 0 : Number(state.discountRupees);
  const inverters = picksFromRows(state.inverters);
  if (!state.propertyId || !state.panelProductId || !inverters) return null;
  if (kw === null || floors === null || distanceKm === null) return null;
  if (!Number.isFinite(discount) || discount < 0) return null;
  const targetWp = Math.round(kw * 1000);
  if (targetWp < 500 || targetWp > 2_000_000) return null;
  const households = state.subsidyCategory === 'society' ? wholeNumber(state.households) : null;
  const battery = state.systemType === 'on_grid' ? null : state.batteryProductId;
  return {
    propertyId: state.propertyId,
    leadId: state.leadId,
    subsidyCategory: state.subsidyCategory,
    households: households && households > 0 ? households : null,
    systemType: state.systemType,
    targetWp,
    panelProductId: state.panelProductId,
    inverters,
    batteryProductId: battery,
    structureType: state.structureType,
    floors,
    distanceKm,
    dcCableMeters: positive(state.dcCableMeters),
    acCableMeters: positive(state.acCableMeters),
    discountPaise: rupeesToPaise(discount),
    extras: [...state.extras],
    costing: state.costing,
  };
}

/** The inverters suggested for the size typed; several of the largest when one is not enough. */
export function suggestInverter(
  inverters: readonly Product[],
  targetKw: string,
  systemType: SystemType,
): InverterRow[] {
  return suggestInverters(inverters, (positive(targetKw) ?? 0) * 1000, systemType);
}
