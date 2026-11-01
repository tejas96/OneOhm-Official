import { Module } from '@nestjs/common';
import { ServiceDeskController } from './service-desk.controller';
import { ServiceDeskService } from './service-desk.service';

/** After-sales: customer service requests and ratings for the office. */
@Module({ controllers: [ServiceDeskController], providers: [ServiceDeskService] })
export class ServiceDeskModule {}
