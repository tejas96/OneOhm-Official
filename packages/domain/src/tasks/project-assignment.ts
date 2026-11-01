import { type AssigneeCandidate, awayDuring, pickAssignee } from './generate-tasks';

/** A contractor (crew company) as the assignment engine sees it (PRD 3.13). */
export interface ContractorOption {
  readonly id: string;
  readonly active: boolean;
  /** Role keys their crews take: their skills, or the roles their crew hold when none are set. */
  readonly roleKeys: readonly string[];
  /** Districts or towns they work in; empty means anywhere. */
  readonly serviceAreas: readonly string[];
  /** Crew member user ids. */
  readonly crew: readonly string[];
  readonly leadUserId: string | null;
  /** Open tasks across their crew, so work spreads between contractors. */
  readonly openTasks: number;
}

/** Who may take a project's tasks (PRD 3.8 "within the selected team and contractors"). */
export interface ProjectPool {
  /** Named team members; empty means anyone in the company. */
  readonly team: readonly string[];
  /** The project's one contractor, if it has one. */
  readonly contractor: ContractorOption | null;
  /** Every crew member of every contractor, to the contractor they belong to. */
  readonly crewOf: ReadonlyMap<string, string>;
}

export interface TaskNeed {
  readonly roleKey: string;
  readonly skillKey?: string | null;
  readonly startDate: string;
  readonly dueDate: string;
}

export interface Assignment {
  readonly userId: string | null;
  /** Given to someone outside the named team because nobody in it fits. */
  readonly outsideTeam: boolean;
}

const normal = (value: string) => value.trim().toLowerCase();

/** True when the contractor works where the site is (or names no areas). */
export function servesArea(
  contractor: Pick<ContractorOption, 'serviceAreas'>,
  places: readonly string[],
): boolean {
  if (contractor.serviceAreas.length === 0) return true;
  const here = new Set(places.map(normal).filter(Boolean));
  return contractor.serviceAreas.some((area) => here.has(normal(area)));
}

/**
 * The contractor for a project when the owner did not pick one: active, takes the crew
 * work the project needs, works in the area and has a crew; the least busy first.
 */
export function chooseContractor(
  contractors: readonly ContractorOption[],
  neededRoles: readonly string[],
  places: readonly string[],
): ContractorOption | null {
  const fits = contractors
    .filter(
      (contractor) =>
        contractor.active &&
        contractor.crew.length > 0 &&
        neededRoles.some((role) => contractor.roleKeys.includes(role)) &&
        servesArea(contractor, places),
    )
    .sort((left, right) => left.openTasks - right.openTasks || left.id.localeCompare(right.id));
  return fits[0] ?? null;
}

/**
 * Crew work goes to the project's one contractor: their crew lead when free, otherwise
 * their least-loaded member. Never to another contractor, so a project is not split.
 */
function crewAssignee(
  candidates: readonly AssigneeCandidate[],
  pool: ProjectPool & { readonly contractor: ContractorOption },
  need: TaskNeed,
): string | null {
  const when = { from: need.startDate, to: need.dueDate };
  const crew = candidates.filter((person) => pool.crewOf.get(person.userId) === pool.contractor.id);
  const lead = crew.find((person) => person.userId === pool.contractor.leadUserId);
  if (lead?.roleKeys.includes(need.roleKey) && !lead.onLeave && !awayDuring(lead, when))
    return lead.userId;
  return pickAssignee(crew, need.roleKey, when, need.skillKey)?.userId ?? null;
}

/**
 * The person for one generated task (PRD 3.8, 3.13): crew work to the project's
 * contractor; other work to the named team, falling back to the whole company (flagged)
 * only when nobody in the team fits. Contractors' crews never take in-house work.
 */
export function pickProjectAssignee(
  candidates: readonly AssigneeCandidate[],
  pool: ProjectPool,
  need: TaskNeed,
): Assignment {
  const contractor = pool.contractor;
  if (contractor?.roleKeys.includes(need.roleKey)) {
    return { userId: crewAssignee(candidates, { ...pool, contractor }, need), outsideTeam: false };
  }
  const when = { from: need.startDate, to: need.dueDate };
  const staff = candidates.filter((person) => !pool.crewOf.has(person.userId));
  if (pool.team.length > 0) {
    const team = staff.filter((person) => pool.team.includes(person.userId));
    const inTeam = pickAssignee(team, need.roleKey, when, need.skillKey);
    if (inTeam) return { userId: inTeam.userId, outsideTeam: false };
  }
  const anyone = pickAssignee(staff, need.roleKey, when, need.skillKey);
  return { userId: anyone?.userId ?? null, outsideTeam: anyone !== null && pool.team.length > 0 };
}
