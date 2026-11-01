import {
  customers,
  type Database,
  discoms,
  documentGeotags,
  documents,
  projectFacts,
  projects,
  projectTasks,
  properties,
  quotations,
  siteVisits,
  users,
} from '@oneohm/database';
import { checklistFor, factLabel, measurementsFor, SURVEY_FACT_KEYS } from '@oneohm/domain';
import { and, arrayOverlaps, asc, eq, isNull } from 'drizzle-orm';

/** Photos printed in the report; the rest stay in the project's documents. */
export const MAX_PHOTOS = 8;
const PRINTABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface SurveyPhoto {
  readonly documentId: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly name: string;
  readonly takenAt: Date | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly distanceM: number | null;
  readonly farFromSite: boolean;
}

export type SurveyTaskRow = typeof projectTasks.$inferSelect;

/** Everything the site survey report prints (PRD 3.4 "survey report generation and approval"). */
export interface SurveyReportData {
  readonly projectId: string;
  readonly customerId: string;
  readonly propertyId: string;
  readonly code: string;
  readonly customer: string;
  readonly phone: string;
  readonly address: string;
  readonly type: string;
  readonly capacityWp: number;
  readonly discom: string;
  readonly quotation: string;
  readonly task: SurveyTaskRow;
  readonly surveyor: string | null;
  readonly approver: string | null;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly checklist: readonly { readonly label: string; readonly done: boolean }[];
  readonly photos: readonly SurveyPhoto[];
  readonly otherFiles: readonly string[];
  readonly checkIn: { readonly at: Date; readonly distanceM: number | null } | null;
}

async function personName(db: Database, id: string | null): Promise<string | null> {
  if (!id) return null;
  const [row] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, id));
  return row?.name ?? null;
}

async function evidence(db: Database, taskId: string) {
  const files = await db
    .select({ file: documents, tag: documentGeotags })
    .from(documents)
    .leftJoin(documentGeotags, eq(documentGeotags.documentId, documents.id))
    .where(
      and(eq(documents.taskId, taskId), isNull(documents.replacedAt), isNull(documents.removedAt)),
    )
    .orderBy(asc(documents.createdAt));
  const photos: SurveyPhoto[] = files
    .filter(({ file }) => PRINTABLE.has(file.contentType))
    .map(({ file, tag }) => ({
      documentId: file.id,
      storageKey: file.storageKey,
      contentType: file.contentType,
      name: file.name,
      takenAt: tag?.capturedAt ?? file.createdAt,
      latitude: tag?.latitude ?? null,
      longitude: tag?.longitude ?? null,
      distanceM: tag?.distanceM ?? null,
      farFromSite: tag?.farFromSite ?? false,
    }));
  const otherFiles = files
    .filter(({ file }) => !PRINTABLE.has(file.contentType))
    .map(({ file }) => file.name);
  return { photos, otherFiles };
}

/** The project's survey task: the one recording the survey facts. Null before one exists. */
export async function surveyTaskOf(db: Database, projectId: string) {
  const [task] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        arrayOverlaps(projectTasks.captures, [...SURVEY_FACT_KEYS]),
      ),
    )
    .orderBy(asc(projectTasks.position))
    .limit(1);
  return task ?? null;
}

/** The report's data, or null when the project has no survey task. */
export async function loadSurveyReport(
  db: Database,
  projectId: string,
): Promise<SurveyReportData | null> {
  const task = await surveyTaskOf(db, projectId);
  if (!task) return null;
  const [row] = await db
    .select({ project: projects, customer: customers, property: properties, discom: discoms.code })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(discoms, eq(discoms.id, projects.discomId))
    .where(eq(projects.id, projectId));
  if (!row) return null;
  const [quote] = await db
    .select({ number: quotations.number })
    .from(quotations)
    .where(eq(quotations.id, row.project.quotationId));
  const factRows = await db
    .select()
    .from(projectFacts)
    .where(eq(projectFacts.projectId, projectId));
  const known = new Map(factRows.map((fact) => [fact.key, fact.value]));
  const keys = [...new Set([...task.captures, ...measurementsFor(task)])];
  const [visit] = await db
    .select({ at: siteVisits.checkInAt, distanceM: siteVisits.checkInDistanceM })
    .from(siteVisits)
    .where(eq(siteVisits.taskId, task.id))
    .orderBy(asc(siteVisits.checkInAt))
    .limit(1);
  const { photos, otherFiles } = await evidence(db, task.id);
  const { project, customer, property } = row;
  return {
    projectId,
    customerId: customer.id,
    propertyId: property.id,
    code: project.code,
    customer: customer.name,
    phone: customer.phoneE164,
    address: `${property.addressLine}, ${property.city}, ${property.district}`,
    type: project.type,
    capacityWp: project.capacityWp,
    discom: row.discom,
    quotation: quote?.number ?? '',
    task,
    surveyor: await personName(db, task.completedByUserId ?? task.assigneeUserId),
    approver: await personName(db, task.approvedByUserId),
    facts: keys.map((key) => ({ label: factLabel(key), value: known.get(key) ?? '' })),
    checklist: checklistFor(task).map((item) => ({ label: item.label, done: known.has(item.key) })),
    photos,
    otherFiles,
    checkIn: visit ?? null,
  };
}
