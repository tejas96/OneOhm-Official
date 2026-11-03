import {
  companyProfile,
  customers,
  notify,
  projectActivities,
  type projects,
  projectTasks,
  type Transaction,
  users,
} from '@oneohm/database';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { queueWhatsApp } from '../../common/outbox';
import { formatPhone } from '../reports/quotation-document';

/** What a team change changed: the timeline, the people and the customer hear about it. */
export interface TeamDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly oldManager: string | null;
  readonly newManager: string | null;
  /** The manager term this change opened; each one tells the customer once. */
  readonly managerTermId: string | null;
  readonly oldTarget: string | null;
  readonly newTarget: string | null;
}

type ProjectRef = Pick<
  typeof projects.$inferSelect,
  'id' | 'code' | 'name' | 'status' | 'customerId'
>;
interface Person {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly phone: string | null;
}
type People = ReadonlyMap<string, Person>;

const LIVE: readonly string[] = ['active', 'operational'];

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateOf = (day: string) => longDate.format(new Date(`${day}T00:00:00Z`));
const nameOf = (people: People, id: string | null) => (id && people.get(id)?.name) || 'someone';
const namesOf = (people: People, ids: readonly string[]) =>
  ids.map((id) => nameOf(people, id)).join(', ');

/** Timeline lines, one per part that changed. */
function timeline(diff: TeamDiff, people: People): { kind: string; message: string }[] {
  const lines: { kind: string; message: string }[] = [];
  if (diff.oldManager !== diff.newManager) {
    const was = diff.oldManager ? ` (was ${nameOf(people, diff.oldManager)})` : '';
    lines.push({
      kind: 'manager_changed',
      message: diff.newManager
        ? `${nameOf(people, diff.newManager)} now manages this project${was}.`
        : `Nobody manages this project now${was}.`,
    });
  }
  const team = [
    diff.added.length > 0 ? `Added: ${namesOf(people, diff.added)}.` : '',
    diff.removed.length > 0 ? `Removed: ${namesOf(people, diff.removed)}.` : '',
  ].filter(Boolean);
  if (team.length > 0) lines.push({ kind: 'team_changed', message: team.join(' ') });
  if (diff.oldTarget !== diff.newTarget)
    lines.push({
      kind: 'target_changed',
      message: diff.newTarget
        ? `Target finish moved to ${dateOf(diff.newTarget)}.`
        : 'Target finish date cleared.',
    });
  return lines;
}

async function peopleOf(tx: Transaction, diff: TeamDiff): Promise<People> {
  const ids = [
    ...new Set(
      [...diff.added, ...diff.removed, diff.oldManager, diff.newManager].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  if (ids.length === 0) return new Map();
  const found = await tx
    .select({ id: users.id, name: users.fullName, status: users.status, phone: users.phoneE164 })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(
    found.map((row) => [
      row.id,
      { id: row.id, name: row.name, active: row.status === 'active', phone: row.phone },
    ]),
  );
}

/** " 2 reviews wait for you." for the reviews on this project that wait on its manager. */
async function reviewsWaiting(tx: Transaction, projectId: string): Promise<string> {
  const [row] = await tx
    .select({ n: count() })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.status, 'in_review'),
        eq(projectTasks.reviewer, 'project_manager'),
      ),
    );
  const n = row?.n ?? 0;
  if (n === 0) return '';
  return n === 1 ? ' 1 review waits for you.' : ` ${n} reviews wait for you.`;
}

/** The customer of a live project hears who their new manager is and how to reach them. */
async function tellCustomer(
  tx: Transaction,
  project: ProjectRef,
  manager: Person,
  termId: string | null,
): Promise<void> {
  if (!termId || !LIVE.includes(project.status)) return;
  const [customer] = await tx
    .select({ name: customers.name, phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, project.customerId));
  if (!customer) return;
  let phone = manager.phone ? formatPhone(manager.phone) : null;
  if (!phone) {
    const [company] = await tx.select({ phones: companyProfile.phones }).from(companyProfile);
    phone = company?.phones[0] ?? null;
  }
  // Without a number to give, the message would be half a message: skip it.
  if (!phone) return;
  await queueWhatsApp(
    tx,
    customer.phone,
    'project_manager_changed',
    { customer: customer.name, project: project.code, manager: manager.name, phone },
    // Per term, not per person: a manager who comes back is news again (A→B→A→B).
    `project_manager_changed:${project.id}:${termId}`,
  );
}

type Tell = (userId: string, kind: string, title: string, body: string) => Promise<void>;

/** The new manager (with the reviews waiting on them), the customer and the old manager. */
async function tellManagers(
  tx: Transaction,
  actor: Actor,
  project: ProjectRef,
  diff: TeamDiff,
  people: People,
  tell: Tell,
): Promise<void> {
  const manager = diff.newManager ? people.get(diff.newManager) : undefined;
  if (manager) {
    const waiting = await reviewsWaiting(tx, project.id);
    await tell(
      manager.id,
      'project_manager',
      `You now manage ${project.code}`,
      `${actor.fullName} made you the manager of ${project.name}.${waiting}`,
    );
    await tellCustomer(tx, project, manager, diff.managerTermId);
  }
  if (diff.oldManager)
    await tell(
      diff.oldManager,
      'project_manager_removed',
      `You no longer manage ${project.code}`,
      manager
        ? `${actor.fullName} made ${manager.name} the manager of ${project.name}.`
        : `${actor.fullName} took you off as manager of ${project.name}.`,
    );
}

/**
 * A saved team change, told: the timeline, the new and old manager, the people added and
 * removed (never the person who made the change), and the customer when the manager changed.
 */
export async function tellTeamChange(
  tx: Transaction,
  actor: Actor,
  project: ProjectRef,
  diff: TeamDiff,
): Promise<void> {
  const people = await peopleOf(tx, diff);
  const lines = timeline(diff, people);
  if (lines.length > 0)
    await tx
      .insert(projectActivities)
      .values(lines.map((line) => ({ ...line, projectId: project.id, userId: actor.userId })));
  const stamp = Date.now();
  const subject = { type: 'project' as const, id: project.id, projectId: project.id };
  const tell: Tell = async (userId, kind, title, body) => {
    if (userId === actor.userId || !people.get(userId)?.active) return;
    await notify(
      tx,
      { userId },
      { kind, title, body, subject, dedupeKey: `${kind}:${project.id}:${userId}:${stamp}` },
    );
  };
  if (diff.oldManager !== diff.newManager)
    await tellManagers(tx, actor, project, diff, people, tell);
  for (const userId of diff.added)
    await tell(
      userId,
      'project_team_added',
      `You joined the ${project.code} team`,
      `${actor.fullName} added you to ${project.name}.`,
    );
  for (const userId of diff.removed)
    await tell(
      userId,
      'project_team_removed',
      `You left the ${project.code} team`,
      `${actor.fullName} took you off ${project.name}.`,
    );
}
