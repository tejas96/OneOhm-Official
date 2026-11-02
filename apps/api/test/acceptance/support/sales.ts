import type { ProjectDetail, QuotationDetail } from '@oneohm/api-contracts';
import type { Session } from './http';

/** A fresh Indian mobile number for "(test)" customers; never one of the standing team. */
export function uniquePhone(): string {
  const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  return `+919${digits}`;
}

/** Today where OneOhm works (India), the same day the API checks dates against. */
export const today = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

interface Product {
  id: string;
  sku: string;
  category: string;
}

/** The seeded catalog items the scenarios quote with, by SKU. */
export async function catalog(admin: Session) {
  const products = await admin.get<Product[]>('/catalog/products');
  const sku = (code: string) => {
    const product = products.find((candidate) => candidate.sku === code);
    if (!product) throw new Error(`Product ${code} is not seeded.`);
    return product.id;
  };
  return {
    dcrPanel: sku('PNL-DCR-545'),
    nonDcrPanel: sku('PNL-NDCR-550'),
    inverter3k: sku('INV-ON-3K'),
    inverter5k: sku('INV-ON-5K'),
    inverter10k: sku('INV-ON-10K'),
    inverter50k: sku('INV-ON-50K'),
    hybrid5k: sku('INV-HYB-5K'),
    battery5k: sku('BAT-LI-5K'),
  };
}

export async function discomId(admin: Session, code: string): Promise<string> {
  const discoms = await admin.get<{ id: string; code: string }[]>('/discoms');
  const found = discoms.find((discom) => discom.code === code);
  if (!found) throw new Error(`DISCOM ${code} is not seeded.`);
  return found.id;
}

export type Category = 'individual' | 'society' | 'commercial';

export interface Customer {
  leadId: string;
  customerId: string;
  propertyId: string;
  phone: string;
  name: string;
}

/** A lead turned into a customer with one site, the way sales does it. */
export async function newCustomer(
  seller: Session,
  input: { name: string; category?: Category; households?: number; discom?: string } & Record<
    string,
    unknown
  >,
): Promise<Customer> {
  const { name, category = 'individual', households, discom, ...property } = input;
  const phone = uniquePhone();
  const lead = await seller.post<{ id: string }>('/leads', {
    name,
    phone,
    city: 'Sangli',
    subsidyCategory: category,
    nextActionOn: today(),
  });
  const converted = await seller.post<{ customerId: string; propertyId: string }>(
    `/leads/${lead.id}/customer`,
    {
      kind: category === 'individual' ? 'individual' : 'organization',
      property: {
        label: 'Site (test)',
        addressLine: '12 Vishrambag Road (test)',
        city: 'Sangli',
        district: 'Sangli',
        state: 'Maharashtra',
        pincode: '416416',
        subsidyCategory: category,
        households: households ?? null,
        discomId: discom ? await discomId(seller, discom) : null,
        meterInSocietyName: category === 'society' ? true : null,
        floors: 1,
        ...property,
      },
    },
  );
  return { leadId: lead.id, phone, name, ...converted };
}

export interface QuoteOptions {
  targetWp?: number;
  category?: Category;
  households?: number;
  panel?: 'dcr' | 'nonDcr';
  inverter?: 'inverter3k' | 'inverter5k' | 'inverter10k' | 'inverter50k' | 'hybrid5k';
  battery?: boolean;
  systemType?: 'on_grid' | 'hybrid' | 'off_grid';
  extra?: Record<string, unknown>;
}

/** The quotation input sales picks; everything else the engine fills. */
export async function quoteInput(admin: Session, options: QuoteOptions = {}) {
  const items = await catalog(admin);
  return {
    subsidyCategory: options.category ?? 'individual',
    households: options.households ?? null,
    systemType: options.systemType ?? (options.battery ? 'hybrid' : 'on_grid'),
    targetWp: options.targetWp ?? 3000,
    panelProductId: options.panel === 'nonDcr' ? items.nonDcrPanel : items.dcrPanel,
    inverterProductId: items[options.inverter ?? (options.battery ? 'hybrid5k' : 'inverter3k')],
    batteryProductId: options.battery ? items.battery5k : null,
    structureType: 'rcc_elevated',
    floors: 1,
    distanceKm: 8,
    ...options.extra,
  };
}

export async function createQuotation(
  seller: Session,
  customer: Customer,
  options: QuoteOptions = {},
): Promise<QuotationDetail> {
  return seller.post<QuotationDetail>('/quotations', {
    propertyId: customer.propertyId,
    leadId: customer.leadId,
    ...(await quoteInput(seller, options)),
  });
}

export interface SaleOptions extends QuoteOptions {
  name?: string;
  discom?: string;
  loan?: boolean;
  loanPaise?: number;
  groundMount?: boolean;
  contractorId?: string | null;
  managerUserId?: string | null;
  project?: Record<string, unknown>;
}

export interface Sale {
  customer: Customer;
  quotation: QuotationDetail;
  project: ProjectDetail;
  /** What POST /projects answered: tasks made, left unassigned, and to confirm. */
  created: { id: string; code: string; tasks: number; unassigned: number; toConfirm: number };
}

/** Lead → customer → quotation → sent → accepted → project, as the admin. */
export async function sellProject(admin: Session, options: SaleOptions = {}): Promise<Sale> {
  const customer = await newCustomer(admin, {
    name: options.name ?? 'Acceptance Customer (test)',
    category: options.category ?? 'individual',
    ...(options.households ? { households: options.households } : {}),
    ...(options.discom ? { discom: options.discom } : {}),
  });
  const quotation = await createQuotation(admin, customer, options);
  await admin.post(`/quotations/${quotation.id}/send`);
  await admin.post(`/quotations/${quotation.id}/accept`);
  const created = await admin.post<Sale['created']>('/projects', {
    quotationId: quotation.id,
    discomId: await discomId(admin, options.discom ?? 'MSEDCL'),
    loan: options.loan ?? false,
    lenderName: options.loan ? 'State Bank of India (test)' : null,
    loanPaise: options.loan ? (options.loanPaise ?? 10_000_000) : 0,
    battery: options.battery ?? false,
    groundMount: options.groundMount ?? false,
    startDate: today(),
    ...(options.contractorId !== undefined ? { contractorId: options.contractorId } : {}),
    ...(options.managerUserId ? { managerUserId: options.managerUserId } : {}),
    ...options.project,
  });
  const project = await admin.get<ProjectDetail>(`/projects/${created.id}`);
  return { customer, quotation, project, created };
}
