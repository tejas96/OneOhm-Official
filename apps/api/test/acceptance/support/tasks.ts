import type { ProjectDetail, ProjectTask, QuotationDetail } from '@oneohm/api-contracts';
import { type FileKind, upload } from './files';
import { Session } from './http';
import { today } from './sales';

/**
 * Walks project tasks the way people do: the assignee signs in on the phone, starts the
 * task, attaches the evidence it asks for, records its facts and completes it; somebody
 * else (the admin) approves work that needs approval. Values are plain test values unless
 * a scenario gives its own.
 */
const sessions = new Map<string, Session>();
let phones: Map<string, string> | null = null;

async function phoneOf(admin: Session, userId: string): Promise<string> {
  if (!phones?.has(userId)) {
    const people = await admin.get<{ id: string; phone: string | null }[]>('/people');
    phones = new Map(people.filter((p) => p.phone).map((p) => [p.id, p.phone ?? '']));
  }
  const phone = phones.get(userId);
  if (!phone) throw new Error(`User ${userId} has no phone to sign in with.`);
  return phone;
}

/** The person's own phone session (sign-in code), reused across the scenario. */
export async function sessionOf(admin: Session, userId: string): Promise<Session> {
  if (userId === admin.userId) return admin;
  const cached = sessions.get(userId);
  if (cached) return cached;
  const session = await Session.code(await phoneOf(admin, userId));
  sessions.set(userId, session);
  return session;
}

export const project = (admin: Session, id: string) => admin.get<ProjectDetail>(`/projects/${id}`);

export function taskByKey(detail: ProjectDetail, key: string): ProjectTask {
  const task = detail.tasks.find((candidate) => candidate.templateKey === key);
  if (!task) throw new Error(`${detail.code} has no task ${key}.`);
  return task;
}

/** Survey values that match a normal one-floor rooftop job (no price change). */
const FACT_DEFAULTS: Record<string, string> = {
  site_floors: '1',
  structure_type: 'RCC elevated',
  roof_length_m: '12',
  roof_width_m: '10',
  shadow_free_area_sqm: '100',
};

function valueFor(field: { key: string; input: string }): string {
  const known = FACT_DEFAULTS[field.key];
  if (known) return known;
  if (field.input === 'date') return today();
  if (field.input === 'number') return '3';
  return `${field.key.replace(/_/g, '-').toUpperCase().slice(0, 18)}-TEST`;
}

/** Facts the completion sends: known values first, then plain test values. */
export function factsFor(task: ProjectTask, overrides: Record<string, string> = {}) {
  const facts: Record<string, string> = {};
  for (const field of task.captureFields) {
    facts[field.key] = task.knownFacts[field.key] ?? valueFor(field);
  }
  for (const item of task.checklist) facts[item.key] = 'yes';
  return { ...facts, ...overrides };
}

/** Makes sure the task has a person: a proposed one is confirmed by the admin. */
async function assigneeOf(admin: Session, task: ProjectTask): Promise<string> {
  if (task.assignee) return task.assignee.id;
  if (task.proposedAssignee) {
    await admin.post(`/tasks/${task.id}/confirm-assignee`, { userId: task.proposedAssignee.id });
    return task.proposedAssignee.id;
  }
  throw new Error(`${task.projectCode}: "${task.title}" (${task.templateKey}) has no assignee.`);
}

export interface WorkOptions {
  /** Who does it; the assignee's own phone session by default. */
  as?: Session;
  facts?: Record<string, string>;
  /** Approve right away when it goes to review (as the admin). */
  approve?: boolean;
}

/** Start → evidence → facts → complete (→ approve). Returns the task afterwards. */
export async function workTask(
  admin: Session,
  task: ProjectTask,
  options: WorkOptions = {},
): Promise<ProjectTask> {
  const doer = options.as ?? (await sessionOf(admin, await assigneeOf(admin, task)));
  if (task.status === 'pending' || task.status === 'ready') {
    await doer.post(`/tasks/${task.id}/start`);
  }
  const kinds: FileKind[] = ['photo', 'document', 'signature'];
  for (const kind of kinds) {
    if (task.missingEvidence.includes(kind)) await upload(doer, kind, { taskId: task.id });
  }
  const done = await doer.post<ProjectTask>(`/tasks/${task.id}/complete`, {
    facts: factsFor(task, options.facts),
    note: 'Done (test)',
  });
  if (done.status === 'in_review' && options.approve !== false) {
    return admin.post<ProjectTask>(`/tasks/${task.id}/approve`);
  }
  return done;
}

/** A survey measures the cable runs the quotation assumed, so the budget locks. */
export async function surveyFacts(
  admin: Session,
  detail: ProjectDetail,
  task: ProjectTask,
): Promise<Record<string, string>> {
  if (!task.captures.includes('dc_cable_meters')) return {};
  const quote = await admin.get<QuotationDetail>(`/quotations/${detail.quotation.id}`);
  const meters = (key: string) =>
    String(quote.lines.find((line) => line.key === key)?.quantity ?? 20);
  return { dc_cable_meters: meters('dc_cable'), ac_cable_meters: meters('ac_cable') };
}

const isOpen = (task: ProjectTask) => task.status !== 'completed';
const isFree = (task: ProjectTask) => isOpen(task) && task.blockedBy.length === 0;

/**
 * Works every task that comes before `key` until that task is free to start, and returns
 * it (not done). Tasks are worked in list order, approvals first.
 */
export async function advanceTo(
  admin: Session,
  projectId: string,
  key: string,
  options: { facts?: Record<string, Record<string, string>> } = {},
): Promise<ProjectTask> {
  for (let step = 0; step < 120; step += 1) {
    const detail = await project(admin, projectId);
    const target = taskByKey(detail, key);
    if (isFree(target) || target.status === 'completed') return target;
    const review = detail.tasks.find((task) => task.status === 'in_review');
    if (review) {
      await admin.post(`/tasks/${review.id}/approve`);
      continue;
    }
    const next = detail.tasks.find((task) => task.id !== target.id && isFree(task));
    if (!next) {
      throw new Error(
        `${detail.code}: nothing open before ${key} (${target.blockedBy.join(', ')}).`,
      );
    }
    const facts = {
      ...(await surveyFacts(admin, detail, next)),
      ...options.facts?.[next.templateKey],
    };
    await workTask(admin, next, { facts });
  }
  throw new Error(`Too many steps before ${key}.`);
}

/** Works everything up to and including `key`. */
export async function completeThrough(
  admin: Session,
  projectId: string,
  key: string,
  options: { facts?: Record<string, Record<string, string>> } = {},
): Promise<ProjectTask> {
  const target = await advanceTo(admin, projectId, key, options);
  if (target.status === 'completed') return target;
  const survey = await surveyFacts(admin, await project(admin, projectId), target);
  return workTask(admin, target, { facts: { ...survey, ...options.facts?.[key] } });
}
