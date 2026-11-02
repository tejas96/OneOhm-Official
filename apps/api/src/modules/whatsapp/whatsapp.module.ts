import { Logger, Module } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { AfterSalesModule } from '../after-sales/after-sales.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { FinanceModule } from '../finance/finance.module';
import { OnlinePaymentsModule } from '../online-payments/online-payments.module';
import { ReportsModule } from '../reports/reports.module';
import { AnswersService } from './assistant/answers.service';
import { AssistantService } from './assistant/assistant.service';
import { FeedbackFlowService } from './assistant/feedback-flow';
import { HandOverService } from './assistant/hand-over';
import { MediaIntakeService } from './assistant/media-intake';
import { ProblemFlowService } from './assistant/problem-flow';
import { QuoteActionsService } from './assistant/quote-actions';
import { StrangerFlowService } from './assistant/stranger-flow';
import { ChatsService } from './chats.service';
import { DeliveriesService } from './deliveries.service';
import { createMediaGateway, WHATSAPP_MEDIA } from './media-gateway';
import { SharedFilesController } from './shared-files.controller';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

/** The customer WhatsApp assistant, the staff inbox and delivery receipts (PRD 6). */
@Module({
  imports: [
    CustomerPortalModule,
    FinanceModule,
    OnlinePaymentsModule,
    ReportsModule,
    AfterSalesModule,
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController, SharedFilesController],
  providers: [
    AssistantService,
    AnswersService,
    ChatsService,
    DeliveriesService,
    MediaIntakeService,
    ProblemFlowService,
    FeedbackFlowService,
    HandOverService,
    StrangerFlowService,
    QuoteActionsService,
    {
      // Photos customers send: fetched from Meta when live, a sample file in log mode.
      provide: WHATSAPP_MEDIA,
      inject: [ENVIRONMENT],
      useFactory: (env: Environment) => {
        const log = new Logger('WhatsApp');
        return createMediaGateway(env, (line) => log.log(line));
      },
    },
  ],
})
export class WhatsAppModule {}
