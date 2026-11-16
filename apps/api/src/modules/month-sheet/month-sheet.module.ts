import { Module } from '@nestjs/common';
import { MonthSheetController } from './month-sheet.controller';
import { MonthSheetService } from './month-sheet.service';

/** The month sheet for salary and the worker's My month (Duty Day step 7). */
@Module({
  controllers: [MonthSheetController],
  providers: [MonthSheetService],
})
export class MonthSheetModule {}
