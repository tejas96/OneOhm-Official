import { Module } from '@nestjs/common';
import { CommandCenterService } from '../dashboard/command-center.service';
import { TeamLoadController } from '../dashboard/team-load.controller';
import { TeamLoadService } from '../dashboard/team-load.service';
import { ReportsModule } from '../reports/reports.module';
import { BudgetCheckService } from './budget-check.service';
import { FinanceService } from './finance.service';
import { ProjectCreationService } from './project-creation.service';
import { ProjectReadService } from './project-read.service';
import { ProjectsController, TasksController } from './projects.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ReportsModule],
  controllers: [ProjectsController, TasksController, TeamLoadController],
  providers: [
    BudgetCheckService,
    ProjectCreationService,
    ProjectReadService,
    FinanceService,
    TasksService,
    CommandCenterService,
    TeamLoadService,
  ],
  exports: [FinanceService],
})
export class ProjectsModule {}
