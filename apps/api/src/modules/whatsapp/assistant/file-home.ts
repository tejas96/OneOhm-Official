import { type DatabaseExecutor, documentRequests, projects } from '@oneohm/database';
import { isPersonDocumentCategory, PERSON_DOCUMENT_CATEGORIES } from '@oneohm/domain';
import { and, eq, isNotNull, notInArray } from 'drizzle-orm';
import { type CustomerHome, customerHomes } from '../../customer-portal/customer-homes';
import type { PaperPlace } from '../file-paper';
import { STEP_MINUTES } from './chat-step';

/** The home a burst of files is for: a property of the customer, or their person papers. */
export type HomeChoice = { readonly propertyId: string | 'person' };

/** The home the customer picked, kept in the chat's context for STEP_MINUTES. */
export interface FileHome extends HomeChoice {
  readonly at: number;
}

/** Files waiting for "Which home?", at most this many (a list's worth). */
export const MAX_TO_SORT = 10;

const FILE_HOME_TAP =
  /^fhome:(person|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The property a "Which home?" row was tapped for, 'person' for the person row, else null. */
export const fileHomeTapped = (choiceId: string | null): string | 'person' | null =>
  FILE_HOME_TAP.exec(choiceId ?? '')?.[1] ?? null;

/**
 * Where a customer's file goes without asking: their one home; the home they picked in the
 * last 30 minutes; the only home with open site requests. Else they are asked.
 */
export function chooseHome(input: {
  homes: readonly CustomerHome[];
  openSiteRequestHomes: readonly string[];
  remembered: FileHome | null;
  now: number;
}): HomeChoice | 'ask' {
  const { homes, remembered } = input;
  const [only] = homes;
  if (homes.length === 1 && only) return { propertyId: only.propertyId };
  const live = (id: string) => id === 'person' || homes.some((home) => home.propertyId === id);
  if (
    remembered &&
    input.now - remembered.at <= STEP_MINUTES * 60_000 &&
    live(remembered.propertyId)
  )
    return { propertyId: remembered.propertyId };
  const asking = new Set(input.openSiteRequestHomes.filter(live));
  const [single] = [...asking];
  if (asking.size === 1 && single) return { propertyId: single };
  return 'ask';
}

/** The home picked a moment ago, from the chat's context. */
export function rememberedHome(context: unknown): FileHome | null {
  const kept = (context as { fileHome?: Partial<FileHome> } | null)?.fileHome;
  if (typeof kept?.propertyId !== 'string' || typeof kept.at !== 'number') return null;
  return { propertyId: kept.propertyId, at: kept.at };
}

/** The files waiting for "Which home?", oldest first. */
export function toSortOf(context: unknown): string[] {
  const list = (context as { toSort?: unknown } | null)?.toSort;
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
}

/** The properties whose projects have open requests for a site paper (not ID or income). */
async function openSiteRequestHomes(db: DatabaseExecutor, customerId: string) {
  const rows = await db
    .selectDistinct({ propertyId: projects.propertyId })
    .from(documentRequests)
    .innerJoin(projects, eq(projects.id, documentRequests.projectId))
    .where(
      and(
        eq(documentRequests.customerId, customerId),
        eq(documentRequests.status, 'open'),
        notInArray(documentRequests.category, [...PERSON_DOCUMENT_CATEGORIES]),
        isNotNull(projects.propertyId),
      ),
    );
  return rows.map((row) => row.propertyId).filter((id): id is string => Boolean(id));
}

/**
 * The customer's homes and where a file sent now goes: a home, 'ask', or null for a
 * customer with no home at all (the file stays under the customer, as before).
 */
export async function homeForFile(
  db: DatabaseExecutor,
  chat: { context: unknown },
  customerId: string,
  now = Date.now(),
): Promise<{ homes: CustomerHome[]; choice: HomeChoice | 'ask' | null }> {
  const homes = await customerHomes(db, customerId);
  if (homes.length === 0) return { homes, choice: null };
  const choice = chooseHome({
    homes,
    openSiteRequestHomes: await openSiteRequestHomes(db, customerId),
    remembered: rememberedHome(chat.context),
    now,
  });
  return { homes, choice };
}

/** Where a file of this home is filed; the person row keeps it off every home. */
export function placeOn(
  homes: readonly CustomerHome[],
  choice: HomeChoice,
  category = 'other',
): PaperPlace | null {
  if (choice.propertyId === 'person') return null;
  const home = homes.find((each) => each.propertyId === choice.propertyId);
  return home ? { projectId: home.projectId, propertyId: home.propertyId, category } : null;
}

/** Whether an open request is answered by a file for this home. */
export const requestFits = (choice: HomeChoice, category: string): boolean =>
  choice.propertyId !== 'person' || isPersonDocumentCategory(category);
