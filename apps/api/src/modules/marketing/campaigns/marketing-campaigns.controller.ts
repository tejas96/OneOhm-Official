import { Controller, Inject, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimitFor } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan, can } from '../../../common/auth/actor';
import { CurrentActor } from '../../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { apiContract } from '../../../contract';
import { ObjectStorageService } from '../../documents/object-storage.service';
import type { IncomingFile } from '../../documents/upload-file';
import { MARKETING_CONFIG, type MarketingConfig } from '../marketing-config.provider';
import { pauseCampaign, runAgain, stopCampaign } from './campaign-actions';
import type { CampaignContext } from './campaign-context';
import { launchCampaign } from './campaign-create';
import { readDefaults } from './campaign-defaults.read';
import { readDetail } from './campaign-detail.read';
import { CAMPAIGN_MEDIA_TYPES, saveMedia } from './campaign-media';
import { readOverview } from './overview.read';
import { markReviewsSeen } from './overview-extra.read';
import { readWaitingLeads } from './waiting-leads.read';

const routes = apiContract.marketing;
const mediaFile = () =>
  UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: uploadLimitFor(CAMPAIGN_MEDIA_TYPES), files: 1 },
    }),
  );

/** Marketing campaigns: the home numbers, the New campaign screen, launch, pause, stop, run again. */
@Controller()
export class MarketingCampaignsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(MARKETING_CONFIG) private readonly config: MarketingConfig,
    private readonly storage: ObjectStorageService,
  ) {}

  private get ctx(): CampaignContext {
    return { db: this.db, env: this.env, config: this.config, storage: this.storage };
  }

  @TsRestHandler(routes.overview)
  overview(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.overview, async () => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await readOverview(this.ctx) };
    });
  }

  @TsRestHandler(routes.defaults)
  defaults(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.defaults, async () => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await readDefaults(this.ctx) };
    });
  }

  @TsRestHandler(routes.uploadMedia)
  @mediaFile()
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.uploadMedia, async () => ({
      status: 201,
      body: await saveMedia(this.ctx, actor, file),
    }));
  }

  @TsRestHandler(routes.launch)
  launch(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.launch, async ({ body }) => {
      assertCan(actor, 'marketing.manage');
      return { status: 201, body: await launchCampaign(this.ctx, actor, body) };
    });
  }

  @TsRestHandler(routes.campaign)
  campaign(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.campaign, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await readDetail(this.db, this.env.API_PUBLIC_URL, params.id) };
    });
  }

  @TsRestHandler(routes.pause)
  pause(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.pause, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await pauseCampaign(this.ctx, actor, params.id) };
    });
  }

  @TsRestHandler(routes.stop)
  stop(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.stop, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await stopCampaign(this.ctx, actor, params.id) };
    });
  }

  @TsRestHandler(routes.runAgain)
  again(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.runAgain, async ({ params }) => {
      assertCan(actor, 'marketing.manage');
      return { status: 200, body: await runAgain(this.ctx, actor, params.id) };
    });
  }

  @TsRestHandler(routes.reviewsSeen)
  reviewsSeen(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.reviewsSeen, async () => {
      assertCan(actor, 'marketing.manage');
      await markReviewsSeen(this.db);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(routes.waitingLeads)
  waiting(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.waitingLeads, async () => {
      assertCan(actor, 'leads.manage', 'leads.view_all');
      const all = can(actor, 'leads.view_all');
      return { status: 200, body: await readWaitingLeads(this.db, actor.userId, all) };
    });
  }
}
