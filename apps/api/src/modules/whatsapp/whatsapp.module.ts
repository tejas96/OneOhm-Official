import { Module } from '@nestjs/common';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { FinanceModule } from '../finance/finance.module';
import { OnlinePaymentsModule } from '../online-payments/online-payments.module';
import { ReportsModule } from '../reports/reports.module';
import { AnswersService } from './assistant/answers.service';
import { AssistantService } from './assistant/assistant.service';
import { ChatsService } from './chats.service';
import { DeliveriesService } from './deliveries.service';
import { SharedFilesController } from './shared-files.controller';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

/** The customer WhatsApp assistant, the staff inbox and delivery receipts (PRD 6). */
@Module({
  imports: [CustomerPortalModule, FinanceModule, OnlinePaymentsModule, ReportsModule],
  controllers: [WhatsAppController, WhatsAppWebhookController, SharedFilesController],
  providers: [AssistantService, AnswersService, ChatsService, DeliveriesService],
})
export class WhatsAppModule {}
