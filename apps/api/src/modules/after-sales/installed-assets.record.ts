import {
  companyProfile,
  type DatabaseExecutor,
  installedAssets,
  products,
  projectFacts,
  projects,
  projectTasks,
  quotationLines,
  quotations,
  warrantyPolicy,
} from '@oneohm/database';
import {
  type AssetKind,
  DEFAULT_WARRANTY_POLICY,
  parseSerials,
  type WarrantyPolicy,
  warrantyFor,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

type Product = { id: string; name: string; brand: string; wattageWp: number | null };
type NewAsset = typeof installedAssets.$inferInsert;

export async function warrantyPolicyOf(db: DatabaseExecutor): Promise<WarrantyPolicy> {
  const [row] = await db.select().from(warrantyPolicy).where(eq(warrantyPolicy.id, 'default'));
  return row?.policy ?? DEFAULT_WARRANTY_POLICY;
}

/** The day testing and commissioning finished, in India; null before it has. */
export async function commissionedOn(
  db: DatabaseExecutor,
  projectId: string,
): Promise<string | null> {
  const [task] = await db
    .select({ at: projectTasks.completedAt })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.onComplete, 'commissioning_completed'),
        isNotNull(projectTasks.completedAt),
      ),
    )
    .orderBy(asc(projectTasks.completedAt))
    .limit(1);
  const [project] = await db
    .select({ at: projects.operationalAt })
    .from(projects)
    .where(eq(projects.id, projectId));
  const at = task?.at ?? project?.at ?? null;
  return at ? todayIn('Asia/Kolkata', at) : null;
}

interface Sources {
  readonly projectId: string;
  readonly startsOn: string;
  readonly policy: WarrantyPolicy;
  readonly panel: Product | undefined;
  readonly inverter: Product | undefined;
  readonly battery: Product | undefined;
  readonly moduleCount: number;
  readonly lines: ReadonlyMap<string, string>;
  readonly facts: ReadonlyMap<string, string>;
  readonly installer: string;
}

function asset(sources: Sources, kind: AssetKind, fields: Partial<NewAsset>): NewAsset {
  const cover = warrantyFor(kind, sources.startsOn, sources.policy);
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

/** The system as sold on the accepted quotation, with the serials the crew recorded. */
export function assetsFrom(sources: Sources): NewAsset[] {
  const { facts, lines } = sources;
  const rows: NewAsset[] = [];
  if (sources.panel) {
    const counted = Number(facts.get('module_count'));
    rows.push(
      asset(sources, 'panel', {
        ...productFields(sources.panel, facts.get('module_serial_numbers')),
        quantity: Number.isInteger(counted) && counted > 0 ? counted : sources.moduleCount,
      }),
    );
  }
  if (sources.inverter)
    rows.push(
      asset(
        sources,
        'inverter',
        productFields(sources.inverter, facts.get('inverter_serial_number')),
      ),
    );
  if (sources.battery)
    rows.push(
      asset(sources, 'battery', productFields(sources.battery, facts.get('battery_serial_number'))),
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
  const ids = [quotation.panelProductId, quotation.inverterProductId, quotation.batteryProductId];
  const items = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      wattageWp: products.wattageWp,
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
    inverter: items.find((item) => item.id === quotation.inverterProductId),
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
