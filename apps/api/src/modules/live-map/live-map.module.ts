import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ServiceDeskModule } from '../service-desk/service-desk.module';
import { LiveMapController } from './live-map.controller';
import { LiveMapService } from './live-map.service';

/** The manager's live map of the team on duty today, its alerts and "Send nearest" (Duty Day steps 4, 5). */
@Module({
  imports: [ProjectsModule, ServiceDeskModule],
  controllers: [LiveMapController],
  providers: [LiveMapService],
})
export class LiveMapModule {}
