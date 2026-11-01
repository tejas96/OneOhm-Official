import { Inject, Injectable } from '@nestjs/common';
import type { CommandCenter, ProjectSummary } from '@oneohm/api-contracts';
import { leads, projects, projectTasks, quotations } from '@oneohm/database';
import { addDays, daysBetween, todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { projectSummaries } from '../../common/read-models/project-summary';
import { DATABASE, type Database } from '../../config/core.module';
import { buildActions } from './command-center-actions';
import { moneyFigures } from './command-center-money';

const SEVERITY: Readonly<Record<ProjectSummary['tone'], number>> = {
  overdue: 0,
  waiting: 1,
  atRisk: 2,
  blocked: 3,
  review: 4,
  onTrack: 5,
  neutral: 6,
  done: 7,
};

/**
 * The owner's view of the whole business from deterministic formulas (PRD 3.1):
 * health = 40% delivery (open tasks not overdue) + 35% money (collected of what is due)
 * + 25% team (open tasks with an owner).
 */
@Injectable()
export class CommandCenterService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(): Promise<CommandCenter> {
    const today = todayIn();
    const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00+05:30`);
    const live = (
      await projectSummaries(this.db, inArray(projects.status, ['active', 'operational']))
    ).sort((left, right) => SEVERITY[left.tone] - SEVERITY[right.tone]);
    const money = await moneyFigures(this.db, today);

    const open = await this.db
      .select({ assignee: projectTasks.assigneeUserId, dueDate: projectTasks.dueDate })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          ne(projectTasks.status, 'completed'),
          inArray(projects.status, ['active', 'operational']),
        ),
      );
    const delivery = open.length
      ? Math.round(100 * (1 - open.filter((task) => task.dueDate < today).length / open.length))
      : 100;
    const team = open.length
      ? Math.round((100 * open.filter((task) => task.assignee !== null).length) / open.length)
      : 100;
    const moneyScore =
      money.duePaise > 0 ? Math.round((100 * money.collectedPaise) / money.duePaise) : 100;
    const score = Math.round(0.4 * delivery + 0.35 * moneyScore + 0.25 * team);

    const commissioned = await this.db
      .select({ capacityWp: projects.capacityWp, type: projects.type })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          eq(projectTasks.templateKey, 'testing_commissioning'),
          eq(projectTasks.status, 'completed'),
          gte(projectTasks.completedAt, monthStart),
        ),
      );
    const dueThisWeek = await this.db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.templateKey, 'testing_commissioning'),
          ne(projectTasks.status, 'completed'),
          sql`${projectTasks.dueDate} <= ${addDays(today, 7)}`,
        ),
      );

    const waitingRows = await this.db
      .select({
        party: projectTasks.waitingParty,
        since: projectTasks.waitingSince,
        status: projectTasks.status,
        completedAt: projectTasks.completedAt,
      })
      .from(projectTasks)
      .where(isNotNull(projectTasks.waitingSince));
    const waitingDays = { internal: 0, customer: 0, bank: 0, discom: 0 };
    for (const row of waitingRows) {
      if (!row.since) continue;
      const end =
        row.status === 'completed' && row.completedAt
          ? row.completedAt.toISOString().slice(0, 10)
          : today;
      waitingDays[row.party] += Math.max(0, daysBetween(row.since.toISOString().slice(0, 10), end));
    }

    const leadRows = await this.db
      .select({ stage: leads.stage })
      .from(leads)
      .where(gte(leads.createdAt, monthStart));
    const quoted = await this.db
      .select({ number: quotations.number, acceptedAt: quotations.acceptedAt })
      .from(quotations)
      .where(gte(quotations.createdAt, monthStart));
    const accepted = await this.db
      .select({ id: quotations.id })
      .from(quotations)
      .where(gte(quotations.acceptedAt, monthStart));

    return {
      health: { score, delivery, money: Math.min(100, moneyScore), team },
      installed: {
        wattsPeak: commissioned.reduce((sum, row) => sum + row.capacityWp, 0),
        commissioned: commissioned.length,
        dueThisWeek: dueThisWeek.length,
        byType: {
          residential: commissioned.filter((row) => row.type === 'residential').length,
          society: commissioned.filter((row) => row.type === 'society').length,
          commercial: commissioned.filter((row) => row.type === 'commercial').length,
        },
      },
      collections: {
        collectedPaise: money.collectedPaise,
        duePaise: money.duePaise,
        weekly: money.weekly,
      },
      actions: await buildActions(this.db, today),
      waitingDays,
      pipeline: {
        leads: leadRows.length,
        surveys: leadRows.filter((row) => ['survey_scheduled', 'quoted', 'won'].includes(row.stage))
          .length,
        quotations: new Set(quoted.map((row) => row.number)).size,
        accepted: accepted.length,
      },
      projects: live,
      money: {
        collectedPaise: money.collectedPaise,
        stillDuePaise: money.stillDuePaise,
        bankPendingPaise: money.bankPendingPaise,
        toVendorsPaise: money.toVendorsPaise,
        toContractorsPaise: money.toContractorsPaise,
        advancesPaise: money.advancesPaise,
      },
      liveProjects: live.length,
    };
  }
}
