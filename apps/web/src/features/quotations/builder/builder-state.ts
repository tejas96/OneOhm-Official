import type {
  ExtraLineInput,
  Product,
  Property,
  QuotationDetail,
  QuotationInput,
} from '@oneohm/api-contracts';
import { rupeesToPaise } from '@oneohm/shared';

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
  readonly inverterProductId: string | null;
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
}

export const EMPTY_BUILDER: BuilderState = {
  propertyId: null,
  leadId: null,
  subsidyCategory: 'individual',
  households: '',
  systemType: 'on_grid',
  targetKw: '',
  panelProductId: null,
  inverterProductId: null,
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
    inverterProductId: input.inverterProductId,
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
  if (!state.propertyId || !state.panelProductId || !state.inverterProductId) return null;
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
    inverterProductId: state.inverterProductId,
    batteryProductId: battery,
    structureType: state.structureType,
    floors,
    distanceKm,
    dcCableMeters: positive(state.dcCableMeters),
    acCableMeters: positive(state.acCableMeters),
    discountPaise: rupeesToPaise(discount),
    extras: [...state.extras],
  };
}

const isHybrid = (product: Product) => /hybrid|hyb/i.test(`${product.sku} ${product.name}`);

/**
 * The smallest inverter that carries the array (DC up to 110% of AC), else the largest.
 * Battery systems prefer hybrid inverters, grid-only systems the others; then the cheapest.
 */
export function suggestInverter(
  inverters: readonly Product[],
  targetKw: string,
  systemType: SystemType,
): string | null {
  const wanted = (positive(targetKw) ?? 0) * 1000;
  const wantHybrid = systemType !== 'on_grid';
  const sized = [...inverters]
    .filter((product) => product.active && product.ratedW)
    .sort(
      (left, right) =>
        (left.ratedW ?? 0) - (right.ratedW ?? 0) ||
        Number(isHybrid(left) !== wantHybrid) - Number(isHybrid(right) !== wantHybrid) ||
        left.pricePaise - right.pricePaise,
    );
  const fits = sized.find((product) => (product.ratedW ?? 0) * 1.1 >= wanted);
  return (fits ?? sized.at(-1))?.id ?? null;
}

/** DCR panels where a subsidy is possible (it needs them); otherwise the cheapest panel. */
export function suggestPanel(panels: readonly Product[], category: SubsidyCategory): string | null {
  const active = panels.filter((product) => product.active);
  const wantDcr = category !== 'commercial';
  const preferred = active.filter((product) => product.dcr === wantDcr);
  const pool = preferred.length > 0 ? preferred : active;
  return [...pool].sort((left, right) => left.pricePaise - right.pricePaise)[0]?.id ?? null;
}
