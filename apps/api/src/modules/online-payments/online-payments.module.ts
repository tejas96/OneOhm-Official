import { Module } from '@nestjs/common';
import { BankPayoutsModule } from '../bank-payouts/bank-payouts.module';
import { CustomerPortalModule } from '../customer-portal/customer-portal.module';
import { ProjectsModule } from '../projects/projects.module';
import { CustomerPayController } from './customer-pay.controller';
import { CustomerPayService } from './customer-pay.service';
import { DuePayController } from './due-pay.controller';
import { FinalLinkService } from './final-link.service';
import { GatewayCheckController } from './gateway-check.controller';
import { GatewayPaymentsService } from './gateway-payments.service';
import { LinkSyncService } from './link-sync.service';
import { PaymentLinksController } from './payment-links.controller';
import { PaymentLinksService } from './payment-links.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { SandboxPayController } from './sandbox-pay.controller';

/** Razorpay payment links: sending them, the webhook, payouts and the local sandbox. */
@Module({
  imports: [ProjectsModule, BankPayoutsModule, CustomerPortalModule],
  controllers: [
    PaymentLinksController,
    RazorpayWebhookController,
    SandboxPayController,
    GatewayCheckController,
    CustomerPayController,
    DuePayController,
  ],
  providers: [
    PaymentLinksService,
    GatewayPaymentsService,
    LinkSyncService,
    FinalLinkService,
    CustomerPayService,
  ],
  exports: [PaymentLinksService],
})
export class OnlinePaymentsModule {}
