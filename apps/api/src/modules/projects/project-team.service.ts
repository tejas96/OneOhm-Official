import { Inject, Injectable } from '@nestjs/common';
import type { ProjectSetup, ProjectUpdate, TeamOptions } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  notify,
  projectActivities,
  projects,
  projectTeamMembers,
  roles,
  type Transaction,
  userRoles,
  users,
} from '@oneohm/database';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { surveyTaskOf } from '../reports/survey-report.data';
import { surveyApproved } from './budget-check.service';
import { checkTeam, projectTeamOf } from './project-team';

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
    const people = new Map<string, TeamOptions['people'][number]>();
    for (const row of staff) {
      const person = people.get(row.id) ?? { id: row.id, fullName: row.fullName, roles: [] };
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

  /** A new manager (told, PRD 3.6), named team or target finish; each change audited. */
  async update(actor: Actor, projectId: string, input: ProjectUpdate): Promise<void> {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw notFound('That project');
    if (input.managerUserId) await this.checkManager(input.managerUserId);
    if (input.teamUserIds) await checkTeam(this.db, input.teamUserIds);
    if (input.targetFinishDate && input.targetFinishDate < project.startDate)
      throw invalid('The target finish comes after the start.', {
        targetFinishDate: 'Pick a date on or after the start date.',
      });
    await this.db.transaction(async (tx) => {
      const managerChanged =
        input.managerUserId !== undefined && input.managerUserId !== project.managerUserId;
      await tx
        .update(projects)
        .set({
          ...(managerChanged ? { managerUserId: input.managerUserId } : {}),
          ...(input.targetFinishDate !== undefined
            ? { targetFinishDate: input.targetFinishDate }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
      if (input.teamUserIds) await replaceTeam(tx, projectId, input.teamUserIds);
      if (managerChanged && input.managerUserId)
        await this.tellNewManager(tx, project, input.managerUserId, actor);
      await recordAudit(tx, actor.userId, 'project.team_changed', 'project', projectId, {
        managerUserId: managerChanged ? input.managerUserId : undefined,
        previousManagerUserId: managerChanged ? project.managerUserId : undefined,
        teamUserIds: input.teamUserIds,
        targetFinishDate: input.targetFinishDate,
      });
    });
  }

  private async checkManager(userId: string): Promise<void> {
    const [person] = await this.db
      .select({ id: users.id, crew: contractorMembers.contractorId })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
      .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);
    if (!person || person.crew)
      throw invalid('Pick an active staff member as manager.', {
        managerUserId: 'Choose someone from your own staff.',
      });
  }

  private async tellNewManager(
    tx: Transaction,
    project: ProjectRow,
    managerUserId: string,
    actor: Actor,
  ): Promise<void> {
    const [manager] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, managerUserId));
    await tx.insert(projectActivities).values({
      projectId: project.id,
      kind: 'manager_changed',
      message: `${manager?.name ?? 'A new manager'} now manages this project.`,
      userId: actor.userId,
    });
    if (managerUserId === actor.userId) return;
    await notify(
      tx,
      { userId: managerUserId },
      {
        kind: 'project_manager',
        title: `You now manage ${project.code}`,
        body: `${actor.fullName} made you the manager of ${project.name}.`,
        subject: { type: 'project', id: project.id, projectId: project.id },
        dedupeKey: `project_manager:${project.id}:${managerUserId}:${Date.now()}`,
      },
    );
  }
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
