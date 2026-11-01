import { Module } from '@nestjs/common';
import { PaymentsReadService } from '../finance/payments-read.service';
import { ListsController } from './lists.controller';

/** Paged, server-filtered lists for the long list screens (PRD 9.3). */
@Module({ controllers: [ListsController], providers: [PaymentsReadService] })
export class ListsModule {}
