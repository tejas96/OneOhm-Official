import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { GatewayPaymentsService } from './gateway-payments.service';
import { PaymentLinksController } from './payment-links.controller';
import { PaymentLinksService } from './payment-links.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { SandboxPayController } from './sandbox-pay.controller';

/** Razorpay payment links: sending them, the webhook, payouts and the local sandbox. */
@Module({
  imports: [ProjectsModule],
  controllers: [PaymentLinksController, RazorpayWebhookController, SandboxPayController],
  providers: [PaymentLinksService, GatewayPaymentsService],
})
export class OnlinePaymentsModule {}
