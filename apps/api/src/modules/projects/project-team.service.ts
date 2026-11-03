import { Inject, Injectable } from '@nestjs/common';
import type { ProjectSetup, ProjectUpdate, TeamOptions } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  holdersOf,
  openManagerTerm,
  projects,
  projectTeamMembers,
  roles,
  type Transaction,
  userRoles,
  users,
} from '@oneohm/database';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { surveyTaskOf } from '../reports/survey-report.data';
import { moveCustomerChats } from '../whatsapp/chat-owner';
import { surveyApproved } from './budget-check.service';
import { checkTeam, projectTeamOf } from './project-team';
import { checkHandOver, handOverTasks, refreshOutsideTeam } from './project-team-handover';
import { tellTeamChange } from './project-team-notices';
import { assertTeamEditable, checkManagerCandidate } from './project-team-rules';

type ProjectRow = typeof projects.$inferSelect;

/** A project's team after creation: who can be picked, and changes to it (PRD 3.6, 3.8). */
@Injectable()
export class ProjectTeamService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Active staff with their roles, and every contractor with its crew size and lead. */
  async options(): Promise<TeamOptions> {
    const staff = await this.db
      .select({ id: users.id, fullName: users.fullName, role: roles.name })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
      .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
      .where(
        and(eq(users.status, 'active'), eq(roles.kind, 'staff'), isNull(contractorMembers.userId)),
      )
      .orderBy(asc(users.fullName));
    const managers = new Set(await holdersOf(this.db, 'projects.view_all'));
    const people = new Map<string, TeamOptions['people'][number]>();
    for (const row of staff) {
      const person = people.get(row.id) ?? {
        id: row.id,
        fullName: row.fullName,
        roles: [],
        canManage: managers.has(row.id),
      };
      people.set(row.id, { ...person, roles: [...person.roles, row.role] });
    }
    const companies = await this.db.select().from(contractors).orderBy(asc(contractors.name));
    const crews = await this.db
      .select({
        contractorId: contractorMembers.contractorId,
        lead: contractorMembers.lead,
        name: users.fullName,
      })
      .from(contractorMembers)
      .innerJoin(users, and(eq(users.id, contractorMembers.userId), eq(users.status, 'active')));
    return {
      people: [...people.values()],
      contractors: companies.map((company) => {
        const crew = crews.filter((member) => member.contractorId === company.id);
        return {
          id: company.id,
          name: company.name,
          active: company.active,
          crew: crew.length,
          lead: crew.find((member) => member.lead)?.name ?? null,
          serviceAreas: company.serviceAreas,
        };
      }),
    };
  }

  /** What the overview shows about the team, the target and the survey. */
  async setup(project: ProjectRow): Promise<ProjectSetup> {
    const { contractor, team } = await projectTeamOf(this.db, project.id);
    const survey = await surveyTaskOf(this.db, project.id);
    return {
      contractor,
      team,
      targetFinishDate: project.targetFinishDate,
      canRecheckBudget:
        project.budgetStatus === 'awaiting_survey' && (await surveyApproved(this.db, project.id)),
      surveyReport: survey !== null && ['in_review', 'completed'].includes(survey.status),
    };
  }

  /**
   * A new manager (PRD 3.6), named team or target finish. Every part that changed is told
   * (timeline, people, customer) and audited with what it was before.
   */
  async update(actor: Actor, projectId: string, input: ProjectUpdate): Promise<void> {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw notFound('That project');
    assertTeamEditable(project);
    const managerChanged =
      input.managerUserId !== undefined && input.managerUserId !== project.managerUserId;
    if (managerChanged && input.managerUserId)
      await checkManagerCandidate(this.db, input.managerUserId);
    const before = (
      await this.db
        .select({ id: projectTeamMembers.userId })
        .from(projectTeamMembers)
        .where(eq(projectTeamMembers.projectId, projectId))
    ).map((member) => member.id);
    const team = input.teamUserIds ? [...new Set(input.teamUserIds)] : before;
    if (input.teamUserIds) await checkTeam(this.db, input.teamUserIds, before);
    const removed = before.filter((id) => !team.includes(id));
    const added = team.filter((id) => !before.includes(id));
    await checkHandOver(this.db, projectId, removed, input.handOver);
    if (input.targetFinishDate && input.targetFinishDate < project.startDate)
      throw invalid('The target finish comes after the start.', {
        targetFinishDate: 'Pick a date on or after the start date.',
      });
    const manager = managerChanged ? (input.managerUserId ?? null) : project.managerUserId;
    const target =
      input.targetFinishDate !== undefined ? input.targetFinishDate : project.targetFinishDate;
    const changes = {
      ...(managerChanged ? { managerUserId: manager } : {}),
      ...(input.targetFinishDate !== undefined ? { targetFinishDate: target } : {}),
    };
    await this.db.transaction(async (tx) => {
      // The version-checked update comes first: it locks the project row for the rest.
      await saveProject(tx, projectId, input.version, changes);
      const managerTermId = managerChanged
        ? await openManagerTerm(tx, projectId, manager, new Date())
        : null;
      if (input.teamUserIds) await replaceTeam(tx, projectId, team);
      await handOverTasks(tx, actor, projectId, input.handOver ?? []);
      if (input.teamUserIds || input.handOver?.length)
        await refreshOutsideTeam(tx, projectId, team);
      // The customer's WhatsApp chat follows the manager of their newest live project.
      if (managerChanged && manager)
        await moveCustomerChats(tx, project.customerId, manager, projectId);
      await tellTeamChange(tx, actor, project, {
        added,
        removed,
        oldManager: project.managerUserId,
        newManager: manager,
        managerTermId,
        oldTarget: project.targetFinishDate,
        newTarget: target,
      });
      await recordAudit(tx, actor.userId, 'project.team_changed', 'project', projectId, {
        ...(managerChanged
          ? { managerUserId: manager, previousManagerUserId: project.managerUserId }
          : {}),
        teamUserIds: input.teamUserIds,
        previousTeamUserIds: before,
        targetFinishDate: input.targetFinishDate,
        previousTargetFinishDate: project.targetFinishDate,
      });
    });
  }
}

/** Saves the project's own fields when nobody saved it since `version` was read. */
async function saveProject(
  tx: Transaction,
  projectId: string,
  version: number,
  changes: Partial<Pick<ProjectRow, 'managerUserId' | 'targetFinishDate'>>,
): Promise<void> {
  const saved = await tx
    .update(projects)
    .set({ ...changes, version: sql`${projects.version} + 1`, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.version, version)))
    .returning({ id: projects.id });
  if (saved.length === 0)
    throw conflict('Someone else changed this project. Reload and try again.', 'stale');
}

async function replaceTeam(
  tx: Transaction,
  projectId: string,
  userIds: readonly string[],
): Promise<void> {
  await tx.delete(projectTeamMembers).where(eq(projectTeamMembers.projectId, projectId));
  const unique = [...new Set(userIds)];
  if (unique.length > 0)
    await tx.insert(projectTeamMembers).values(unique.map((userId) => ({ projectId, userId })));
}
