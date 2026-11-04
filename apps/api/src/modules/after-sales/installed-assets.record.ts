import {
  companyProfile,
  type DatabaseExecutor,
  installedAssets,
  products,
  projectFacts,
  projects,
  quotationLines,
  quotations,
} from '@oneohm/database';
import { type AssetKind, parseSerials, type WarrantyPolicy, warrantyFor } from '@oneohm/domain';
import { eq, inArray } from 'drizzle-orm';
import { invertersOf } from '../quotations/quotation-inverters';
import { warrantyPolicyOf } from './commissioned-on';

export { commissionedOn, warrantyPolicyOf } from './commissioned-on';

type Product = {
  id: string;
  name: string;
  brand: string;
  wattageWp: number | null;
  /** The maker's years the quotation printed; null leaves the Settings years. */
  warrantyYears?: number | null;
};
type NewAsset = typeof installedAssets.$inferInsert;

interface Sources {
  readonly projectId: string;
  readonly startsOn: string;
  readonly policy: WarrantyPolicy;
  readonly panel: Product | undefined;
  /** Every inverter model with how many; recorded as one inverter asset (one per kind). */
  readonly inverters: readonly { readonly product: Product; readonly quantity: number }[];
  readonly battery: Product | undefined;
  readonly moduleCount: number;
  readonly lines: ReadonlyMap<string, string>;
  readonly facts: ReadonlyMap<string, string>;
  readonly installer: string;
}

/**
 * The cover for one kind: the product's own warranty years when it has them, as the
 * quotation printed them, else the years set in Settings → Warranty.
 */
function asset(
  sources: Sources,
  kind: AssetKind,
  fields: Partial<NewAsset>,
  productYears?: number | null,
): NewAsset {
  const policy = productYears
    ? { ...sources.policy, [kind]: { ...sources.policy[kind], years: productYears } }
    : sources.policy;
  const cover = warrantyFor(kind, sources.startsOn, policy);
  return {
    projectId: sources.projectId,
    kind,
    model: fields.model ?? kind,
    make: fields.make ?? null,
    productId: fields.productId ?? null,
    quantity: fields.quantity ?? 1,
    serialNumbers: fields.serialNumbers ?? [],
    warrantyStartsOn: cover.startsOn,
    warrantyEndsOn: cover.endsOn,
    performanceEndsOn: cover.performanceEndsOn,
  };
}

const productFields = (product: Product, serials: string | undefined) => ({
  make: product.brand,
  model: product.wattageWp ? `${product.name} (${product.wattageWp} Wp)` : product.name,
  productId: product.id,
  serialNumbers: parseSerials(serials ?? ''),
});

/** Mixed inverter models share one asset: it carries the shortest years any of them has. */
function inverterYears(inverters: Sources['inverters']): number | null {
  const years = inverters.map(({ product }) => product.warrantyYears ?? null);
  if (years.some((value) => !value)) return null;
  return Math.min(...(years as number[]));
}

/** The system as sold on the accepted quotation, with the serials the crew recorded. */
export function assetsFrom(sources: Sources): NewAsset[] {
  const { facts, lines } = sources;
  const rows: NewAsset[] = [];
  if (sources.panel) {
    const counted = Number(facts.get('module_count'));
    rows.push(
      asset(
        sources,
        'panel',
        {
          ...productFields(sources.panel, facts.get('module_serial_numbers')),
          quantity: Number.isInteger(counted) && counted > 0 ? counted : sources.moduleCount,
        },
        sources.panel.warrantyYears,
      ),
    );
  }
  const [mainInverter] = sources.inverters;
  if (mainInverter) {
    const mixed = sources.inverters.length > 1;
    rows.push(
      asset(
        sources,
        'inverter',
        {
          ...productFields(mainInverter.product, facts.get('inverter_serial_number')),
          // Several models share the one inverter asset: name them all, count them all.
          ...(mixed
            ? {
                make: [...new Set(sources.inverters.map(({ product }) => product.brand))].join(
                  ', ',
                ),
                model: sources.inverters
                  .map(({ product, quantity }) =>
                    quantity > 1 ? `${product.name} × ${quantity}` : product.name,
                  )
                  .join(', '),
              }
            : {}),
          quantity: sources.inverters.reduce((sum, { quantity }) => sum + quantity, 0),
        },
        inverterYears(sources.inverters),
      ),
    );
  }
  if (sources.battery)
    rows.push(
      asset(
        sources,
        'battery',
        productFields(sources.battery, facts.get('battery_serial_number')),
        sources.battery.warrantyYears,
      ),
    );
  const structure = lines.get('structure');
  if (structure) rows.push(asset(sources, 'structure', { model: structure }));
  rows.push(
    asset(sources, 'workmanship', {
      make: sources.installer,
      model: lines.get('installation') ?? 'Installation and commissioning',
    }),
  );
  return rows;
}

/**
 * Records what was installed, with warranties from `startsOn` (the commissioning day).
 * Runs once per project: kinds already recorded are left as they are.
 */
export async function recordInstalledAssets(
  db: DatabaseExecutor,
  projectId: string,
  startsOn: string,
): Promise<number> {
  const [project] = await db
    .select({ quotation: quotations })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.id, projectId));
  if (!project) return 0;
  const { quotation } = project;
  const picks = await invertersOf(db, quotation.id);
  const ids = [
    quotation.panelProductId,
    ...picks.map((pick) => pick.productId),
    quotation.batteryProductId,
  ];
  const items = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      wattageWp: products.wattageWp,
      warrantyYears: products.warrantyYears,
    })
    .from(products)
    .where(
      inArray(
        products.id,
        ids.filter((id): id is string => Boolean(id)),
      ),
    );
  const lines = await db
    .select({ key: quotationLines.key, description: quotationLines.description })
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotation.id));
  const facts = await db
    .select({ key: projectFacts.key, value: projectFacts.value })
    .from(projectFacts)
    .where(eq(projectFacts.projectId, projectId));
  const [company] = await db.select({ brand: companyProfile.brandName }).from(companyProfile);
  const rows = assetsFrom({
    projectId,
    startsOn,
    policy: await warrantyPolicyOf(db),
    panel: items.find((item) => item.id === quotation.panelProductId),
    inverters: picks.flatMap((pick) => {
      const product = items.find((item) => item.id === pick.productId);
      return product ? [{ product, quantity: pick.quantity }] : [];
    }),
    battery: items.find((item) => item.id === quotation.batteryProductId),
    moduleCount: quotation.moduleCount,
    lines: new Map(lines.map((line) => [line.key, line.description])),
    facts: new Map(facts.map((fact) => [fact.key, fact.value])),
    installer: company?.brand ?? 'OneOhm',
  });
  const saved = await db
    .insert(installedAssets)
    .values(rows)
    .onConflictDoNothing({ target: [installedAssets.projectId, installedAssets.kind] })
    .returning({ id: installedAssets.id });
  return saved.length;
}
