import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { forbidden } from '../../common/http/errors';
import { apiContract } from '../../contract';
import { pdfBody } from '../reports/reports.controller';
import { SurveyReportService } from '../reports/survey-report.service';
import { AssignmentConfirmService } from './assignment-confirm.service';
import { BudgetCheckService } from './budget-check.service';
import { EscalationPolicyService } from './escalation-policy.service';
import { ProjectReadService } from './project-read.service';
import { ProjectTeamService } from './project-team.service';
import { TasksService } from './tasks.service';

@Controller()
export class ProjectTeamController {
  constructor(
    private readonly team: ProjectTeamService,
    private readonly read: ProjectReadService,
    private readonly budget: BudgetCheckService,
    private readonly confirmations: AssignmentConfirmService,
    private readonly tasks: TasksService,
    private readonly survey: SurveyReportService,
    private readonly escalation: EscalationPolicyService,
  ) {}

  @TsRestHandler(apiContract.projectTeam)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.projectTeam, {
      teamOptions: async () => {
        if (!can(actor, 'projects.create')) assertCan(actor, 'projects.manage');
        return { status: 200, body: await this.team.options() };
      },
      updateProject: async ({ params, body }) => {
        assertCan(actor, 'projects.manage');
        await this.team.update(actor, params.id, body);
        return { status: 200, body: await this.read.get(params.id) };
      },
      recheckBudget: async ({ params }) => {
        assertCan(actor, 'projects.manage');
        await this.budget.recheck(actor, params.id);
        return { status: 200, body: await this.read.get(params.id) };
      },
      confirmAssignee: async ({ params, body }) => {
        assertCan(actor, 'tasks.assign');
        await this.confirmations.confirm(actor, params.id, body.userId);
        return { status: 200, body: await this.tasks.get(actor, params.id) };
      },
      surveyReportPdf: async ({ params }) => {
        assertCan(actor, 'projects.view_all');
        if (actor.kind !== 'staff') throw forbidden();
        const file = await this.survey.render(params.id);
        return { status: 200, body: pdfBody(file, 'inline') };
      },
      escalationPolicy: async () => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.escalation.get() };
      },
      updateEscalationPolicy: async ({ body }) => {
        assertCan(actor, 'settings.manage');
        return { status: 200, body: await this.escalation.update(actor, body) };
      },
    });
  }
}
