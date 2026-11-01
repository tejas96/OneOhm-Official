import { Module } from '@nestjs/common';
import { MessageTemplatesService } from './message-templates.service';
import { TaskTemplatesService } from './task-templates.service';
import { TemplatesController } from './templates.controller';

/** Task templates with their notification rules, and WhatsApp templates (PRD 7.2). */
@Module({
  controllers: [TemplatesController],
  providers: [MessageTemplatesService, TaskTemplatesService],
})
export class TemplatesModule {}
