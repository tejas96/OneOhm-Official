import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  errorDetail,
  type MetaDetails,
  type MetaTools,
  type MetaWebhookEvent,
  metaTools,
  type PlatformLead,
  readConnection,
  readMetaWebhook,
} from '@oneohm/marketing';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { LeadIntakeService } from '../crm/lead-intake.service';
import { MARKETING_CONFIG, type MarketingConfig } from '../marketing/marketing-config.provider';
import { handleOnce } from './event-flow';
import { readMetaLead, saveFormLead } from './form-lead';
import { alertGiveUp } from './lead-alerts';
import { metaPostAccess, metaSecrets, metaVerify } from './meta-access';
import { handleSocialEvent, prepareSocial } from './social-message';

/** What is read from outside before the work: the lead form entry, or the person's name. */
type MetaPrepared = { lead: PlatformLead } | { profileName: string | null };

/**
 * Meta's page and Instagram webhook: lead form entries, and messages and comments on
 * Instagram and Facebook. Every post is signed with the app secret (with none set, the
 * webhook does not exist). An event is claimed and handled in one transaction: one that
 * fails is undone and answered 500, so Meta sends it again. A failure waiting cannot fix is
 * claimed, the leads desk is told, and Meta is answered 200.
 */
@Public()
@Controller('v1/webhooks/meta')
export class MetaWebhookController {
  private readonly log = new Logger('MetaWebhook');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(MARKETING_CONFIG) private readonly config: MarketingConfig,
    private readonly intake: LeadIntakeService,
  ) {}

  /** The one-time check Meta makes when the webhook is set up. */
  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    const checked = metaVerify(metaSecrets(this.env).verifyToken, { mode, token, challenge });
    if (checked.ok) return checked.challenge;
    throw checked.status === 404 ? new NotFoundException() : new ForbiddenException();
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ handled: number; skipped: number }> {
    const access = metaPostAccess(metaSecrets(this.env).appSecret, request.rawBody, signature);
    if (access === 'not_found') throw new NotFoundException();
    if (access === 'bad_signature') throw new UnauthorizedException('Bad signature.');
    const details = ((await readConnection(this.db, 'meta', this.config.mode))?.details ??
      {}) as MetaDetails;
    const events = readMetaWebhook(request.body, {
      pageId: details.pageId ?? null,
      instagramId: details.instagramId ?? null,
    });
    if (events.length === 0) return { handled: 0, skipped: 0 };
    // Built only when something needs Meta (a lead to read, a name to look up), and once.
    let built: Promise<MetaTools | null> | undefined;
    const tools = () => {
      built ??= metaTools(this.db, this.config);
      return built;
    };
    const { handled, skipped, failed } = await handleOnce<MetaWebhookEvent, MetaPrepared>(
      events,
      this.db,
      {
        prepare: async (event) =>
          event.kind === 'lead'
            ? { lead: await readMetaLead(await tools(), event) }
            : await prepareSocial(this.db, tools, event),
        apply: async (event, prepared, tx) => {
          if (event.kind === 'lead' && 'lead' in prepared) {
            const outcome = await saveFormLead(
              tx,
              this.intake,
              prepared.lead,
              'meta',
              event.key,
              event.adId,
            );
            if (outcome === 'no_phone')
              this.log.warn(
                `Lead form entry ${event.leadgenId} has no usable phone; no lead made.`,
              );
            return;
          }
          if (event.kind !== 'lead' && 'profileName' in prepared)
            await handleSocialEvent(tx, this.intake, prepared, event);
        },
        giveUp: (event, reason, tx) =>
          alertGiveUp(
            tx,
            reason,
            event.key,
            event.kind === 'lead' ? 'Meta lead form entry' : 'Meta message',
          ),
        onError: (event, error) =>
          this.log.error(`Meta event ${event.key} failed: ${errorDetail(error)}`),
      },
    );
    if (failed > 0) throw new InternalServerErrorException(`${failed} event(s) not handled.`);
    return { handled, skipped };
  }
}
