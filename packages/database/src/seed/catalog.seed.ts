import {
  CUSTOMER_STEP_TITLES,
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_MILESTONES,
  DEFAULT_SUBSIDY_RULES,
  DEFAULT_TASK_LIBRARY,
  STEP_MESSAGE_DEFAULTS,
  taskDescription,
} from '@oneohm/domain';
import type { Database } from '../client';
import {
  discoms,
  messageTemplates,
  paymentPlans,
  products,
  subsidyRules,
  taskTemplates,
} from '../schema';

const rupees = (value: number) => value * 100;

/** DISCOMs named in the PRD (3.16). */
const DISCOMS = [
  {
    code: 'MSEDCL',
    name: 'Maharashtra State Electricity Distribution Co. Ltd.',
    state: 'Maharashtra',
    expectedDays: 30,
  },
  { code: 'TATA', name: 'Tata Power (Mumbai)', state: 'Maharashtra', expectedDays: 30 },
  { code: 'ADANI', name: 'Adani Electricity Mumbai', state: 'Maharashtra', expectedDays: 30 },
  { code: 'BEST', name: 'BEST Undertaking', state: 'Maharashtra', expectedDays: 30 },
];

/**
 * STARTER CATALOG. OneOhm's real product list and prices were not provided; these
 * generic items keep quotations working until replaced in Settings → Catalog.
 */
const STARTER_PRODUCTS = [
  {
    sku: 'PNL-DCR-545',
    name: 'Mono PERC module',
    brand: 'Starter catalog',
    category: 'panel',
    unit: 'nos',
    wattageWp: 545,
    dcr: true,
    price: 14_200,
    cost: 12_100,
    tax: 500,
  },
  {
    sku: 'PNL-DCR-580',
    name: 'TOPCon bifacial module',
    brand: 'Starter catalog',
    category: 'panel',
    unit: 'nos',
    wattageWp: 580,
    dcr: true,
    price: 15_400,
    cost: 13_100,
    tax: 500,
  },
  {
    sku: 'PNL-NDCR-550',
    name: 'Mono PERC module',
    brand: 'Starter catalog',
    category: 'panel',
    unit: 'nos',
    wattageWp: 550,
    dcr: false,
    price: 9_600,
    cost: 8_000,
    tax: 500,
  },
  {
    sku: 'INV-ON-3K',
    name: 'On-grid inverter 3 kW',
    brand: 'Starter catalog',
    category: 'inverter',
    unit: 'nos',
    ratedW: 3000,
    price: 24_000,
    cost: 19_500,
    tax: 500,
  },
  {
    sku: 'INV-ON-5K',
    name: 'On-grid inverter 5 kW',
    brand: 'Starter catalog',
    category: 'inverter',
    unit: 'nos',
    ratedW: 5000,
    price: 34_000,
    cost: 28_000,
    tax: 500,
  },
  {
    sku: 'INV-ON-10K',
    name: 'On-grid inverter 10 kW (three phase)',
    brand: 'Starter catalog',
    category: 'inverter',
    unit: 'nos',
    ratedW: 10000,
    price: 62_000,
    cost: 52_000,
    tax: 500,
  },
  {
    sku: 'INV-ON-25K',
    name: 'On-grid inverter 25 kW (three phase)',
    brand: 'Starter catalog',
    category: 'inverter',
    unit: 'nos',
    ratedW: 25000,
    price: 1_18_000,
    cost: 99_000,
    tax: 500,
  },
  {
    sku: 'INV-ON-50K',
    name: 'On-grid inverter 50 kW (three phase)',
    brand: 'Starter catalog',
    category: 'inverter',
    unit: 'nos',
    ratedW: 50000,
    price: 2_05_000,
    cost: 1_72_000,
    tax: 500,
  },
  {
    sku: 'INV-HYB-5K',
    name: 'Hybrid inverter 5 kW',
    brand: 'Starter catalog',
    category: 'inverter',
    unit: 'nos',
    ratedW: 5000,
    price: 58_000,
    cost: 48_000,
    tax: 500,
  },
  {
    sku: 'BAT-LI-5K',
    name: 'Lithium battery 5 kWh',
    brand: 'Starter catalog',
    category: 'battery',
    unit: 'nos',
    ratedW: 5000,
    price: 1_15_000,
    cost: 96_000,
    tax: 1800,
  },
] as const;

export async function seedCatalog(db: Database): Promise<void> {
  await db.insert(discoms).values(DISCOMS).onConflictDoNothing();
  await db
    .insert(products)
    .values(
      STARTER_PRODUCTS.map((product) => ({
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unit: product.unit,
        wattageWp: 'wattageWp' in product ? product.wattageWp : null,
        ratedW: 'ratedW' in product ? product.ratedW : null,
        dcr: 'dcr' in product ? product.dcr : false,
        pricePaise: rupees(product.price),
        costPaise: rupees(product.cost),
        taxRateBp: product.tax,
      })),
    )
    .onConflictDoNothing();

  const existingRules = await db.select({ id: subsidyRules.id }).from(subsidyRules).limit(1);
  if (existingRules.length === 0) {
    await db.insert(subsidyRules).values(
      DEFAULT_SUBSIDY_RULES.map((rule) => ({
        category: rule.category,
        validFrom: rule.validFrom,
        slabs: rule.slabs,
        capPaise: rule.capPaise,
        perHouseholdWp: rule.perHouseholdWp ?? null,
        maxEligibleWp: rule.maxEligibleWp ?? null,
      })),
    );
  }

  await db
    .insert(taskTemplates)
    .values(
      DEFAULT_TASK_LIBRARY.map((template, position) => ({
        key: template.key,
        title: template.title,
        description: template.description ?? taskDescription(template.key),
        stage: template.stage,
        roleKey: template.roleKey,
        offsetDays: template.offsetDays,
        durationDays: template.durationDays,
        dependsOn: [...template.dependsOn],
        conditions: template.when ?? null,
        waitingParty: template.waitingParty,
        customerVisible: template.customerVisible,
        notifyCustomer: template.notifyCustomer,
        approval: template.approval,
        reviewer: template.reviewer ?? 'approvers',
        evidence: [...template.evidence],
        captures: [...template.captures],
        onComplete: template.onComplete ?? null,
        confirmAssignee: template.confirmAssignee ?? false,
        escalateAfterDays: template.escalateAfterDays ?? null,
        reports: [...(template.reports ?? [])],
        // Customer-facing words and message (PRD 5.2, 6.2); internal steps have none.
        customerTitle: CUSTOMER_STEP_TITLES[template.key] ?? null,
        ...STEP_MESSAGE_DEFAULTS[template.key],
        position,
      })),
    )
    .onConflictDoNothing();

  // Owners may have changed these in Settings, so existing rows are left alone.
  await db
    .insert(messageTemplates)
    .values(
      DEFAULT_MESSAGE_TEMPLATES.map((template) => ({
        key: template.key,
        audience: template.audience,
        metaName: template.key,
        fields: [...template.fields],
        preview: template.preview,
      })),
    )
    .onConflictDoNothing();

  // The standard terms, once; owners add or change plans in Settings.
  const [plan] = await db.select({ id: paymentPlans.id }).from(paymentPlans).limit(1);
  if (!plan)
    await db.insert(paymentPlans).values({
      name: 'Standard 25 / 65 / 10',
      steps: DEFAULT_MILESTONES.map((step) => ({ ...step })),
      isDefault: true,
    });
}
