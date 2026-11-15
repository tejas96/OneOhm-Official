import { Global, Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { MarketingCampaignsController } from './campaigns/marketing-campaigns.controller';
import { ConnectCallbackController } from './connections/connect-callback.controller';
import { MarketingConnectionsController } from './connections/marketing-connections.controller';
import { MARKETING_CONFIG, marketingConfigProvider } from './marketing-config.provider';
import { MarketingPublicController } from './public/marketing-public.controller';

/**
 * Marketing (spec 2026-11-15): campaigns, connections, landing pages and campaign media. The
 * config is global, so the intake module (webhooks) reads the same one.
 */
@Global()
@Module({
  imports: [DocumentsModule],
  controllers: [
    MarketingCampaignsController,
    MarketingConnectionsController,
    ConnectCallbackController,
    MarketingPublicController,
  ],
  providers: [marketingConfigProvider],
  exports: [MARKETING_CONFIG],
})
export class MarketingModule {}
