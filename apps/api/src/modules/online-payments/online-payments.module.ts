import { Module } from '@nestjs/common';
import { BankPayoutsModule } from '../bank-payouts/bank-payouts.module';
import { ProjectsModule } from '../projects/projects.module';
import { GatewayCheckController } from './gateway-check.controller';
import { GatewayPaymentsService } from './gateway-payments.service';
import { LinkSyncService } from './link-sync.service';
import { PaymentLinksController } from './payment-links.controller';
import { PaymentLinksService } from './payment-links.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { SandboxPayController } from './sandbox-pay.controller';

/** Razorpay payment links: sending them, the webhook, payouts and the local sandbox. */
@Module({
  imports: [ProjectsModule, BankPayoutsModule],
  controllers: [
    PaymentLinksController,
    RazorpayWebhookController,
    SandboxPayController,
    GatewayCheckController,
  ],
  providers: [PaymentLinksService, GatewayPaymentsService, LinkSyncService],
  exports: [PaymentLinksService],
})
export class OnlinePaymentsModule {}
