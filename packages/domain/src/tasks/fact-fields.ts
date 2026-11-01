/**
 * The facts tasks record (they feed the statutory reports), with the label people read
 * and the kind of input to show. One list for the API's errors, the web and the apps.
 */
export type FactInput = 'text' | 'number' | 'date' | 'long';

export interface FactField {
  readonly key: string;
  readonly label: string;
  readonly input: FactInput;
  readonly hint?: string;
}

type FieldSpec = readonly [label: string, input?: FactInput, hint?: string];

const SPECS: Readonly<Record<string, FieldSpec>> = {
  site_floors: ['Number of floors', 'number'],
  structure_type: ['Structure type', 'text', 'For example RCC elevated, tin shed or ground mount'],
  dc_cable_meters: ['DC cable length (m)', 'number'],
  ac_cable_meters: ['AC cable length (m)', 'number'],
  consumer_number: ['Consumer number'],
  sanctioned_capacity_kw: ['Sanctioned load (kW)', 'number'],
  meter_holder_name: ['Meter holder name'],
  sanction_number: ['DISCOM sanction number'],
  sanction_date: ['DISCOM sanction date', 'date'],
  purchase_order_number: ['Purchase order number'],
  purchase_order_date: ['Purchase order date', 'date'],
  module_make: ['Panel make'],
  module_wattage: ['Panel wattage (Wp)', 'number'],
  cell_manufacturer_name: ['Cell manufacturer'],
  cell_gst_invoice_no: ['Cell GST invoice number'],
  module_serial_numbers: ['Panel serial numbers', 'long', 'One per line, or separated by commas'],
  module_count: ['Number of panels', 'number'],
  inverter_make: ['Inverter make'],
  inverter_serial_number: ['Inverter serial number'],
  earthing_resistance: ['Earthing resistance (Ω)', 'number'],
  meter_serial_number: ['Generation meter serial number'],
  meter_make: ['Meter make'],
  meter_capacity: ['Meter capacity'],
  installed_capacity_kw: ['Installed capacity (kW)', 'number'],
  inverter_total_kw: ['Inverter capacity (kW)', 'number'],
  module_total_kw: ['Module capacity (kW)', 'number'],
  consumer_name: ['Consumer name'],
  consumer_phone: ['Consumer mobile'],
  consumer_email: ['Consumer email'],
  site_address: ['Site address', 'long'],
  site_city: ['District'],
  site_state: ['State'],
  system_cost: ['System cost'],
  project_onboarded_date: ['Onboarding date', 'date'],
  module_model_number: ['Panel model number'],
  module_efficiency: ['Panel efficiency (%)', 'number'],
  inverter_make_model: ['Inverter make and model'],
  application_number: ['DISCOM application number'],
  ev_meter_number: ['EV meter number'],
};

/** A readable name for any fact key, known or not. */
export function factLabel(key: string): string {
  const known = SPECS[key]?.[0];
  if (known) return known;
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The label, input kind and hint for one fact. */
export function factField(key: string): FactField {
  const spec = SPECS[key];
  const input = spec?.[1] ?? (key.endsWith('_date') ? 'date' : 'text');
  const hint = spec?.[2];
  return { key, label: factLabel(key), input, ...(hint ? { hint } : {}) };
}

export const KNOWN_FACT_KEYS: readonly string[] = Object.keys(SPECS);
