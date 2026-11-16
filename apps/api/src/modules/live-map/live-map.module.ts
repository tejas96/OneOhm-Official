import { Module } from '@nestjs/common';
import { LiveMapController } from './live-map.controller';
import { LiveMapService } from './live-map.service';

/** The manager's live map of the team on duty today (Duty Day step 4). */
@Module({
  controllers: [LiveMapController],
  providers: [LiveMapService],
})
export class LiveMapModule {}
