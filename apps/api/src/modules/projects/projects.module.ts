import { Module } from '@nestjs/common';
import { CommandCenterService } from '../dashboard/command-center.service';
import { TeamLoadController } from '../dashboard/team-load.controller';
import { TeamLoadService } from '../dashboard/team-load.service';
import { ReportsModule } from '../reports/reports.module';
import { AssignmentConfirmService } from './assignment-confirm.service';
import { BudgetCheckService } from './budget-check.service';
import { EscalationPolicyService } from './escalation-policy.service';
import { FinanceService } from './finance.service';
import { ProjectCreationService } from './project-creation.service';
import { ProjectReadService } from './project-read.service';
import { ProjectTeamController } from './project-team.controller';
import { ProjectTeamService } from './project-team.service';
import { ProjectsController, TasksController } from './projects.controller';
import { TaskFlowService } from './task-flow.service';
import { TasksService } from './tasks.service';

@Module({
  imports: [ReportsModule],
  controllers: [ProjectsController, TasksController, TeamLoadController, ProjectTeamController],
  providers: [
    BudgetCheckService,
    ProjectCreationService,
    ProjectReadService,
    FinanceService,
    TasksService,
    TaskFlowService,
    CommandCenterService,
    TeamLoadService,
    ProjectTeamService,
    AssignmentConfirmService,
    EscalationPolicyService,
  ],
  exports: [FinanceService],
})
export class ProjectsModule {}
