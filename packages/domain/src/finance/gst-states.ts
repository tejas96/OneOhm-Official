/**
 * GST state codes (the first two digits of a GSTIN) and how the tax on one supply is
 * split. A supply inside the supplier's own state carries CGST plus SGST; a supply to
 * another state carries IGST (IGST Act s.7–8). For a rooftop system installed at a
 * site, the place of supply is the state where the site is.
 */
export interface GstState {
  readonly code: string;
  readonly name: string;
}

export const GST_STATES: readonly GstState[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

/** Older and everyday spellings people type into an address. */
const ALIASES: Readonly<Record<string, string>> = {
  orissa: '21',
  pondicherry: '34',
  'new delhi': '07',
  'nct of delhi': '07',
  'jammu & kashmir': '01',
  'andaman & nicobar islands': '35',
  'daman and diu': '26',
  'dadra and nagar haveli': '26',
};

const squash = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** The state for a name as written on a property ("Maharashtra", "maharashtra "). */
export function gstStateByName(name: string): GstState | null {
  const wanted = squash(name);
  const code = ALIASES[wanted] ?? GST_STATES.find((state) => squash(state.name) === wanted)?.code;
  return GST_STATES.find((state) => state.code === code) ?? null;
}

export function gstStateByCode(code: string): GstState | null {
  return GST_STATES.find((state) => state.code === code) ?? null;
}

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The GSTIN check character (mod-36 with alternating weights 1 and 2). */
function checkCharacter(first14: string): string {
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = CHARS.indexOf(first14.charAt(index)) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS.charAt((36 - (sum % 36)) % 36);
}

/** A well-formed GSTIN for a real state, with a correct check character. */
export function isValidGstin(value: string): boolean {
  const gstin = value.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) return false;
  if (!gstStateByCode(gstin.slice(0, 2))) return false;
  return checkCharacter(gstin.slice(0, 14)) === gstin.charAt(14);
}

/** The state a GSTIN is registered in, from its first two digits. */
export function gstStateFromGstin(gstin: string): GstState | null {
  return gstStateByCode(gstin.trim().slice(0, 2));
}

export type SupplyType = 'intra_state' | 'inter_state';

export interface GstSplit {
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
}

/**
 * Splits one line's GST. Inside the state it is halved into CGST and SGST (an odd
 * paisa goes to CGST, so the parts always add up to the tax); otherwise it is IGST.
 */
export function splitGst(taxPaise: number, supply: SupplyType): GstSplit {
  if (supply === 'inter_state') return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const sgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise: taxPaise - sgstPaise, sgstPaise, igstPaise: 0 };
}

export function supplyTypeFor(supplierStateCode: string, placeOfSupplyCode: string): SupplyType {
  return supplierStateCode === placeOfSupplyCode ? 'intra_state' : 'inter_state';
}

/** How an invoice names a state: "27-Maharashtra". */
export const stateLabel = (state: GstState) => `${state.code}-${state.name}`;
