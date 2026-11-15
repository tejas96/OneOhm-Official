import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  Post,
} from '@nestjs/common';
import {
  errorDetail,
  type GoogleDetails,
  readConnection,
  readGoogleLeadWebhook,
} from '@oneohm/marketing';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { LeadIntakeService } from '../crm/lead-intake.service';
import { MARKETING_CONFIG, type MarketingConfig } from '../marketing/marketing-config.provider';
import { handleOnce } from './event-flow';
import { saveFormLead } from './form-lead';
import { alertGiveUp } from './lead-alerts';
import { sameText } from './meta-access';

/**
 * Google lead form posts (Google Ads lead form webhook). The post carries the key we gave
 * the form; a wrong or missing key is refused. Each lead is claimed and made in one
 * transaction; a lead that fails is undone and answered 500, so Google sends it again.
 */
@Public()
@Controller('v1/webhooks/google-leads')
export class GoogleLeadsController {
  private readonly log = new Logger('GoogleLeads');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MARKETING_CONFIG) private readonly config: MarketingConfig,
    private readonly intake: LeadIntakeService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Body() body: unknown): Promise<Record<string, never>> {
    const post = readGoogleLeadWebhook(body);
    if (!post) throw new BadRequestException();
    // A practice connection's key is public: in live mode only a real connection's key counts.
    const details = (await readConnection(this.db, 'google', this.config.mode))?.details as
      | GoogleDetails
      | undefined;
    if (!details?.leadFormKey || !sameText(details.leadFormKey, post.key))
      throw new ForbiddenException();
    const { failed } = await handleOnce(
      [{ key: `google:lead:${post.lead.platformLeadId}`, lead: post.lead }],
      this.db,
      {
        prepare: async () => undefined,
        apply: async ({ key, lead }, _, tx) => {
          if ((await saveFormLead(tx, this.intake, lead, 'google', key)) === 'no_phone')
            this.log.warn(`Google lead ${lead.platformLeadId} has no usable phone; no lead made.`);
        },
        giveUp: ({ key }, reason, tx) => alertGiveUp(tx, reason, key, 'Google lead form entry'),
        onError: ({ key }, error) =>
          this.log.error(`Google lead ${key} failed: ${errorDetail(error)}`),
      },
    );
    if (failed > 0) throw new InternalServerErrorException('Lead not handled.');
    return {};
  }
}
