import {
  askForPaper,
  chatOwnerFor,
  customerActions,
  customers,
  type Database,
  documents,
  notifications,
  notifyCover,
  notifyHolders,
  paperRequestTemplate,
  projects,
  tellChatTeam,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { isWorkingTime } from '@oneohm/domain';
import { and, asc, desc, eq, gt, isNull, like, lte, ne, or, sql } from 'drizzle-orm';
import { queueActionChecks } from './action-checks';
import { queueActionReminders } from './action-reminders';
import { queueCallTasks } from './call-tasks';
import { filesNotMatched, unmatchedBody } from './paper-unmatched';
import { queueVisitReminders } from './visit-reminders';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * A request's customer is reminded once from 2 days after the latest ask, the asker told
 * once from 4 days; nothing for a request this old when the job first runs (7 and 14
 * days). Files left to sort are chased from 2 hours to 7 days.
 */
const CUSTOMER_AFTER = 2 * DAY;
const CUSTOMER_UNTIL = 7 * DAY;
const TEAM_AFTER = 4 * DAY;
const TEAM_UNTIL = 14 * DAY;
const SORT_AFTER = 2 * HOUR;
const SORT_UNTIL = 7 * DAY;
/** At most this many are looked at in one tick; the rest wait for the next. */
const PER_TICK = 200;

/** What an open request is due for, counted from the latest time the customer was asked. */
export function paperReminderDue(askedAt: Date, now: Date): 'customer' | 'team' | null {
  const age = now.getTime() - askedAt.getTime();
  if (age < CUSTOMER_AFTER || age >= TEAM_UNTIL) return null;
  return age >= TEAM_AFTER ? 'team' : 'customer';
}

interface WaitingRequest {
  readonly id: string;
  readonly title: string;
  readonly customer: string;
  readonly projectId: string | null;
  readonly requestedByUserId: string | null;
  readonly managerUserId: string | null;
  readonly round: number;
}

/** The asker (else the project's manager) hears once per round; `unmatched` files to match. */
async function tellAsker(db: Database, request: WaitingRequest, unmatched: number) {
  const notice = {
    kind: 'paper_waiting',
    title: `Still waiting for ${request.title} from ${request.customer}`,
    body: unmatched
      ? unmatchedBody(request.customer, unmatched)
      : 'The customer was asked more than 4 days ago and has not sent it. Please call them.',
    ...(request.projectId ? { subject: { type: 'project' as const, id: request.projectId } } : {}),
    dedupeKey: `paper_waiting:${request.id}:${request.round}`,
  };
  const person = request.requestedByUserId ?? request.managerUserId;
  // Nobody to ask: those who manage projects hear, so it is never silent.
  if (person) await notifyCover(db, person, 'projects.manage', notice);
  else await notifyHolders(db, 'projects.manage', notice);
}

/**
 * Open requests: remind the customer at 2 days, tell the asker at 4. Each once per ask. A
 * customer who sent files since the ask that answer nothing is not chased: the asker is
 * told at 2 days to match them instead.
 */
async function remindOpenRequests(db: Database, now: Date, timeZone: string): Promise<number> {
  // The team asking again starts a new round: its age and its keys count from there.
  // Rows from before customer actions were audited as `document_request.*`.
  const reasked = sql`a.entity in ('customer_action', 'document_request') and a.action in ('customer_action.reasked', 'document_request.reasked')`;
  const reasks = sql<number>`(select count(*)::int from audit_log a where ${reasked} and a.entity_id = ${customerActions.id}::text)`;
  const askedAt = sql<Date>`greatest(${customerActions.createdAt}, coalesce((select max(a.created_at) from audit_log a where ${reasked} and a.entity_id = ${customerActions.id}::text), ${customerActions.createdAt}))`;
  const at = (ms: number) => new Date(now.getTime() - ms);
  const open = await db
    .select({
      id: customerActions.id,
      title: customerActions.title,
      projectId: customerActions.projectId,
      projectCode: projects.code,
      customerId: customerActions.customerId,
      propertyId: sql<
        string | null
      >`coalesce(${projects.propertyId}, ${customerActions.propertyId})`,
      managerUserId: projects.managerUserId,
      requestedByUserId: customerActions.requestedByUserId,
      askedAt: sql<Date>`${askedAt}`.mapWith((value) => new Date(value as string)),
      round: reasks,
      customer: customers.name,
      phone: customers.phoneE164,
    })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .where(
      and(
        eq(customerActions.type, 'paper'),
        eq(customerActions.status, 'open'),
        // A cancelled project needs no papers.
        or(isNull(projects.id), ne(projects.status, 'cancelled')),
        lte(askedAt, at(CUSTOMER_AFTER)),
        gt(askedAt, at(TEAM_UNTIL)),
        // Once the asker has been told for this round, there is nothing left to do.
        sql`not exists (select 1 from notifications n where n.dedupe_key like 'paper_waiting:' || ${customerActions.id}::text || ':' || ${reasks}::text || ':%')`,
      ),
    )
    .orderBy(asc(askedAt))
    .limit(PER_TICK);
  let template: Awaited<ReturnType<typeof paperRequestTemplate>> | undefined;
  let done = 0;
  for (const request of open) {
    const due = paperReminderDue(request.askedAt, now);
    if (!due) continue;
    // Files sent but not matched: the team matches them; the customer is not chased.
    const unmatched = await filesNotMatched(db, request);
    // The customer hears in working hours only (as onboarding nudges); a later tick sends it.
    const chase = unmatched === 0 && isWorkingTime(now, timeZone);
    if (chase && now.getTime() - request.askedAt.getTime() < CUSTOMER_UNTIL) {
      template ??= await paperRequestTemplate(db);
      const key = `paper_reminder:${request.id}:${request.round}`;
      if (await askForPaper(db, request, key, template)) done += 1;
    }
    if (due !== 'team' && unmatched === 0) continue;
    await tellAsker(db, request, unmatched);
    done += 1;
  }
  return done;
}

/**
 * Files a customer sent on WhatsApp that stayed "to sort" (not yet said what they are) for
 * over 2 hours: the chat's person is told once, one alert
 * for all of the customer's waiting files. A later file makes a fresh alert (its key is
 * the newest file's), and running again says nothing twice.
 */
async function alertFilesToSort(db: Database, now: Date): Promise<number> {
  const waiting = await db
    .select({
      id: documents.id,
      customerId: customers.id,
      customer: customers.name,
      chat: {
        id: waConversations.id,
        phone: waConversations.phone,
        customerId: waConversations.customerId,
        assignedUserId: waConversations.assignedUserId,
        handledByUserId: waConversations.handledByUserId,
      },
    })
    .from(documents)
    .innerJoin(waMessages, eq(waMessages.documentId, documents.id))
    .innerJoin(waConversations, eq(waConversations.id, waMessages.conversationId))
    .innerJoin(customers, eq(customers.id, documents.customerId))
    .where(
      and(
        isNull(documents.projectId),
        isNull(documents.propertyId),
        isNull(documents.removedAt),
        isNull(documents.sortedAt),
        eq(documents.category, 'other'),
        lte(documents.createdAt, new Date(now.getTime() - SORT_AFTER)),
        gt(documents.createdAt, new Date(now.getTime() - SORT_UNTIL)),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(PER_TICK);
  // Newest first: the first file seen for a customer is the one that names the alert.
  const byCustomer = new Map<string, { files: Set<string>; first: (typeof waiting)[number] }>();
  for (const file of waiting) {
    const group = byCustomer.get(file.customerId) ?? { files: new Set(), first: file };
    group.files.add(file.id);
    byCustomer.set(file.customerId, group);
  }
  let alerted = 0;
  for (const { files, first } of byCustomer.values()) {
    const key = `paper_sort:${first.id}`;
    const [told] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(like(notifications.dedupeKey, `${key}:%`))
      .limit(1);
    if (told) continue;
    const owner = first.chat.assignedUserId ?? (await chatOwnerFor(db, first.chat));
    await tellChatTeam(
      db,
      { ...first.chat, assignedUserId: owner },
      {
        kind: 'papers_to_sort',
        title: `Files to sort from ${first.customer}`,
        body:
          files.size === 1
            ? 'A file has not been sorted yet. Open the chat and file it on the right home.'
            : `${files.size} files have not been sorted yet. Open the chat and file them on the right home.`,
        key,
      },
    );
    alerted += 1;
  }
  return alerted;
}

/**
 * Chases papers (papers per home): a customer reminder at 2 days (in working hours of the
 * business time zone) and a word to the asker at 4 for requests still open, and the chat's
 * person for files left to sort. Every tick is safe to repeat: each reminder and alert has
 * a key per ask round or per file.
 */
export async function queuePaperReminders(
  db: Database,
  now: Date,
  timeZone: string,
): Promise<number> {
  const reminded = await remindOpenRequests(db, now, timeZone);
  const asked =
    (await queueActionReminders(db, now, timeZone)) +
    (await queueActionChecks(db, now, timeZone)) +
    (await queueCallTasks(db, now)) +
    (await queueVisitReminders(db, now, timeZone));
  return reminded + asked + (await alertFilesToSort(db, now));
}
