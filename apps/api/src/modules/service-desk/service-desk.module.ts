import { Module } from '@nestjs/common';
import { ServiceDeskController } from './service-desk.controller';
import { ServiceDeskService } from './service-desk.service';
import { ServiceVisitDayService } from './service-visit-day.service';

/** After-sales: customer service requests and ratings for the office. */
@Module({
  controllers: [ServiceDeskController],
  providers: [ServiceDeskService, ServiceVisitDayService],
})
export class ServiceDeskModule {}
