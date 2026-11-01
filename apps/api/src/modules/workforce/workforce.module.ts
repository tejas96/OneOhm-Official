import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AttendanceService } from './attendance.service';
import { BonusesService } from './bonuses.service';
import { CapacityService } from './capacity.service';
import { CorrectionsService } from './corrections.service';
import { EngagementController } from './engagement.controller';
import { LeaveService } from './leave.service';
import { MyRewardsService } from './my-rewards.service';
import { PointsService } from './points.service';
import { RewardsController } from './rewards.controller';
import { WorkdayService } from './workday.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceSettingsService } from './workforce-settings.service';

/**
 * Attendance with consented location, leave with handover, points and their rules,
 * announcements, bonuses and workload (PRD 3.12, 4.1, 4.7). Old coordinates are
 * cleared by the worker's daily job.
 */
@Module({
  controllers: [WorkforceController, RewardsController, EngagementController],
  providers: [
    WorkdayService,
    AttendanceService,
    CorrectionsService,
    LeaveService,
    PointsService,
    WorkforceSettingsService,
    AnnouncementsService,
    BonusesService,
    CapacityService,
    MyRewardsService,
  ],
})
export class WorkforceModule {}
