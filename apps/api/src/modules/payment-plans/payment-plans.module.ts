import { Module } from '@nestjs/common';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

/** Payment terms for new projects (PRD 3.7, 7.2). */
@Module({ controllers: [PaymentPlansController], providers: [PaymentPlansService] })
export class PaymentPlansModule {}
