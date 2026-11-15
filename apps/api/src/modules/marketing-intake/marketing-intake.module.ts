import { Module } from '@nestjs/common';
import { GoogleLeadsController } from './google-leads.controller';
import { MetaWebhookController } from './meta-webhook.controller';

/** Leads and chats from ads: Meta and Google webhooks, Instagram and Facebook messages. */
@Module({ controllers: [MetaWebhookController, GoogleLeadsController], providers: [] })
export class MarketingIntakeModule {}
