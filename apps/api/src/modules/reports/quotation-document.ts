import type { Company, QuotationDetail, QuotationTotals } from '@oneohm/api-contracts';
import { DEFAULT_MILESTONES, type MilestoneShare, planMilestones } from '@oneohm/domain';
import { formatInr, formatKwp } from '@oneohm/shared';

/** What the quotation document needs beyond the quotation itself. */
export interface QuotationExtras {
  readonly company: Company;
  readonly customerEmail: string | null;
  readonly site: {
    readonly address: string;
    readonly discomName: string | null;
    readonly consumerNumber: string | null;
    readonly sanctionedLoadW: number | null;
  };
  readonly panel: ProductLabel;
  readonly inverter: ProductLabel;
  readonly battery: ProductLabel | null;
  readonly comparison: { readonly dcr: QuotationTotals; readonly nonDcr: QuotationTotals } | null;
  /** The default payment terms shown on the quotation (Settings → Payment terms). */
  readonly paymentSteps?: readonly MilestoneShare[];
  readonly logo: string;
  readonly stamp: string;
}

export interface ProductLabel {
  readonly name: string;
  readonly wattageWp: number | null;
  readonly ratedW: number | null;
  readonly dcr: boolean;
}

const SYSTEM_TYPE = { on_grid: 'On-grid', hybrid: 'Hybrid', off_grid: 'Off-grid' } as const;
const STRUCTURE = {
  rcc_elevated: 'Elevated structure on RCC roof',
  tin_shed: 'Structure on tin shed',
  ground_mount: 'Ground-mounted structure',
} as const;
const CATEGORY = {
  individual: 'Individual home',
  society: 'Housing society / RWA',
  commercial: 'Commercial / industrial',
} as const;

/** One line each, printed when the expected subsidy is ₹0. */
export const SUBSIDY_REASONS: Readonly<Record<string, string>> = {
  commercial: 'Commercial and industrial systems are not eligible for PM Surya Ghar subsidy.',
  non_dcr_panels:
    'Subsidy needs DCR panels (made with Indian cells); this system uses non-DCR panels.',
  off_grid: 'Only on-grid and hybrid systems are eligible for subsidy.',
  meter_not_in_society_name: "The society's electricity meter must be in the society's name.",
  already_subsidised: 'This property has already received a rooftop solar subsidy.',
  no_rule: 'No subsidy rule applies to this category today.',
};

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

export const formatPhone = (e164: string) => {
  const match = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return match ? `+91 ${match[1]} ${match[2]}` : e164;
};

const quantity = (value: number, unit: string) =>
  `${Number.isInteger(value) ? value : value.toFixed(2).replace(/\.?0+$/, '')} ${unit}`;

const percent = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`;

/** Rated output in kW (inverters, batteries, sanctioned load), not panel kWp. */
const kilowatts = (watts: number) => `${Number((watts / 1000).toFixed(2))} kW`;

const productLine = (product: ProductLabel) => {
  const rating = product.wattageWp
    ? `${product.wattageWp} Wp`
    : product.ratedW
      ? kilowatts(product.ratedW)
      : null;
  const named = rating !== null && product.name.toLowerCase().includes(rating.toLowerCase());
  return named || rating === null ? product.name : `${product.name} · ${rating}`;
};

const totalsView = (totals: QuotationTotals) => ({
  total: formatInr(totals.totalPaise),
  subsidy: formatInr(totals.subsidyPaise),
  effective: formatInr(totals.effectivePaise),
});

/** Every string the quotation template prints, formatted once here. */
export function quotationView(quotation: QuotationDetail, extras: QuotationExtras) {
  const { totals, input } = quotation;
  const company = extras.company;
  const itemsBeforeGst = totals.totalPaise - totals.taxPaise + totals.discountPaise;
  const steps = extras.paymentSteps ?? DEFAULT_MILESTONES;
  const schedule = planMilestones(totals.totalPaise, steps);
  return {
    company: {
      name: company.legalName,
      brand: company.brandName,
      address: company.fullAddress,
      gstin: company.gstin,
      email: company.email,
      phones: company.phones.join(' · '),
      signatory: company.signatoryName,
      designation: company.signatoryDesignation,
    },
    logo: extras.logo,
    stamp: extras.stamp,
    number:
      quotation.revision > 1 ? `${quotation.number} · R${quotation.revision}` : quotation.number,
    draft: quotation.status === 'draft',
    date: longDate.format(new Date(quotation.createdAt)),
    validUntil: longDate.format(new Date(`${quotation.validUntil}T12:00:00+05:30`)),
    customer: {
      name: quotation.customer.name,
      phone: formatPhone(quotation.customerPhone),
      email: extras.customerEmail,
    },
    site: {
      label: quotation.propertyLabel,
      address: extras.site.address,
      discom: extras.site.discomName,
      consumerNumber: extras.site.consumerNumber,
      sanctionedLoad: extras.site.sanctionedLoadW ? kilowatts(extras.site.sanctionedLoadW) : null,
      category: CATEGORY[input.subsidyCategory],
    },
    system: {
      capacity: formatKwp(totals.capacityWp),
      type: SYSTEM_TYPE[input.systemType],
      modules: `${totals.moduleCount} × ${productLine(extras.panel)}`,
      panelKind: extras.panel.dcr ? 'DCR (made with Indian cells)' : 'Non-DCR',
      inverter: productLine(extras.inverter),
      battery: extras.battery ? productLine(extras.battery) : null,
      structure: STRUCTURE[input.structureType],
    },
    lines: quotation.lines.map((line, index) => ({
      index: index + 1,
      description: line.description,
      quantity: quantity(line.quantity, line.unit),
      gst: percent(line.taxRateBp),
      amount: formatInr(line.amountPaise + line.contingencyPaise),
    })),
    money: {
      items: formatInr(itemsBeforeGst),
      discount: totals.discountPaise > 0 ? formatInr(totals.discountPaise) : null,
      gst: formatInr(totals.taxPaise),
      ...totalsView(totals),
      subsidyReason: totals.subsidyIneligible ? SUBSIDY_REASONS[totals.subsidyIneligible] : null,
    },
    comparison: extras.comparison
      ? { dcr: totalsView(extras.comparison.dcr), nonDcr: totalsView(extras.comparison.nonDcr) }
      : null,
    schedule: schedule.map((milestone, index) => ({
      index: index + 1,
      label: milestone.label,
      share: percent(steps.find((entry) => entry.key === milestone.key)?.shareBp ?? 0),
      amount: formatInr(milestone.amountPaise),
    })),
  };
}

export type QuotationView = ReturnType<typeof quotationView>;
