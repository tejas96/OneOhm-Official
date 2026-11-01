import { Module } from '@nestjs/common';
import { ProjectChangesController } from './project-changes.controller';
import { ProjectChangesService } from './project-changes.service';

/** Scope and product changes on live projects (PRD 3.6, 3.15). */
@Module({
  controllers: [ProjectChangesController],
  providers: [ProjectChangesService],
})
export class ProjectChangesModule {}
