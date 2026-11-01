import { Module } from '@nestjs/common';
import { CommandCenterService } from '../dashboard/command-center.service';
import { ReportsModule } from '../reports/reports.module';
import { FinanceService } from './finance.service';
import { ProjectCreationService } from './project-creation.service';
import { ProjectReadService } from './project-read.service';
import { ProjectsController, TasksController } from './projects.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ReportsModule],
  controllers: [ProjectsController, TasksController],
  providers: [
    ProjectCreationService,
    ProjectReadService,
    FinanceService,
    TasksService,
    CommandCenterService,
  ],
  exports: [FinanceService],
})
export class ProjectsModule {}
