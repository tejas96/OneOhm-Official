import { Logger, Module } from '@nestjs/common';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { AfterSalesModule } from '../after-sales/after-sales.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { DocumentsModule } from '../documents/documents.module';
import { FinanceModule } from '../finance/finance.module';
import { OnlinePaymentsModule } from '../online-payments/online-payments.module';
import { ReportsModule } from '../reports/reports.module';
import { AnswersService } from './assistant/answers.service';
import { AssistantService } from './assistant/assistant.service';
import { FeedbackFlowService } from './assistant/feedback-flow';
import { FileHomeFlowService } from './assistant/file-home-flow';
import { FilePaperFlowService } from './assistant/file-paper-flow';
import { HandOverService } from './assistant/hand-over';
import { MediaIntakeService } from './assistant/media-intake';
import { MenuAnswersService } from './assistant/menu-answers';
import { PaperRepliesService } from './assistant/paper-replies';
import { ProblemFlowService } from './assistant/problem-flow';
import { QuoteActionsService } from './assistant/quote-actions';
import { StrangerFlowService } from './assistant/stranger-flow';
import { ChatFileKeeper } from './chat-file-keeper';
import { ChatsService } from './chats.service';
import { DeliveriesService } from './deliveries.service';
import { createMediaGateway, WHATSAPP_MEDIA } from './media-gateway';
import { EstimateService } from './onboarding/estimate.service';
import { EstimateNextStepsService } from './onboarding/estimate-next-steps';
import { ChatFilesService } from './onboarding/onboarding-files';
import { OnboardingFlowService } from './onboarding/onboarding-flow';
import { OnboardingNudgesController } from './onboarding/onboarding-nudges.controller';
import { OnboardingNudgesService } from './onboarding/onboarding-nudges.service';
import { SharedFilesController } from './shared-files.controller';
import { WebhookHeartbeatService } from './webhook-heartbeat';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

/** The customer WhatsApp assistant, the staff inbox and delivery receipts (PRD 6). */
@Module({
  imports: [
    CustomerPortalModule,
    DocumentsModule,
    FinanceModule,
    OnlinePaymentsModule,
    ReportsModule,
    AfterSalesModule,
  ],
  controllers: [
    WhatsAppController,
    WhatsAppWebhookController,
    SharedFilesController,
    OnboardingNudgesController,
  ],
  providers: [
    AssistantService,
    AnswersService,
    MenuAnswersService,
    PaperRepliesService,
    ChatsService,
    ChatFileKeeper,
    DeliveriesService,
    MediaIntakeService,
    FileHomeFlowService,
    FilePaperFlowService,
    ProblemFlowService,
    FeedbackFlowService,
    HandOverService,
    StrangerFlowService,
    OnboardingFlowService,
    OnboardingNudgesService,
    ChatFilesService,
    EstimateService,
    EstimateNextStepsService,
    QuoteActionsService,
    WebhookHeartbeatService,
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
