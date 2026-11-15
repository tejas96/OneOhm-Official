import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { marketingMedia } from '@oneohm/database';
import { landingPageUrl, mediaPublicUrl } from '@oneohm/marketing';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Public } from '../../../common/auth/auth.decorators';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { ObjectStorageService } from '../../documents/object-storage.service';
import { businessWhatsAppNumber } from '../../whatsapp/business-number';
import { PAGE_POLICY } from './html';
import { companyInfo, openCampaign, recordClick } from './landing-data';
import { checkForm, readForm, receiveLandingLead } from './landing-lead';
import {
  type LandingView,
  renderEnded,
  renderLanding,
  renderPrivacy,
  renderThanks,
} from './landing-page';
import { byteRange, MEDIA_ID } from './media-range';

const html = (res: Response, status = 200) => {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', PAGE_POLICY);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
};

/**
 * The parts of Marketing that need no sign-in: a campaign's photo or video (it is an ad, and the
 * id is random) and its landing page with the call-back form. Posting the form needs no session
 * or CSRF header: public routes skip both, and the form only creates a lead.
 */
@Public()
@Controller('v1')
export class MarketingPublicController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly storage: ObjectStorageService,
    private readonly intake: LeadIntakeService,
  ) {}

  @Get('m/:mediaId')
  async media(
    @Param('mediaId') mediaId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!MEDIA_ID.test(mediaId)) throw new NotFoundException();
    const [row] = await this.db.select().from(marketingMedia).where(eq(marketingMedia.id, mediaId));
    if (!row) throw new NotFoundException();
    const stored = await this.storage.get(row.storageKey, byteRange(rangeHeader)).catch(() => {
      throw new NotFoundException();
    });
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    // Meta and Google load the file by its link; a browser on another site may show it too.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (stored.contentRange) {
      res.status(206);
      res.setHeader('Content-Range', stored.contentRange);
    }
    return new StreamableFile(stored.body, {
      type: row.contentType,
      ...(stored.length === undefined ? {} : { length: stored.length }),
    });
  }

  @Get('go/:code')
  async landing(
    @Param('code') code: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const campaign = await openCampaign(this.db, code);
    if (!campaign) return this.ended(res);
    const ref = await recordClick(this.db, campaign.id, query);
    html(res);
    return renderLanding(await this.view(campaign, ref));
  }

  @Post('go/:code')
  async submit(
    @Param('code') code: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const campaign = await openCampaign(this.db, code);
    if (!campaign) return this.ended(res);
    const form = readForm(body);
    const { brand } = await companyInfo(this.db);
    // A filled hidden field is a bot: it gets the same thanks and nothing is saved.
    if (form.website) {
      html(res);
      return renderThanks(brand);
    }
    const checked = checkForm(form);
    if ('error' in checked) return this.again(res, campaign, form, checked.error, 400);
    try {
      await receiveLandingLead(
        this.db,
        this.intake,
        campaign,
        { ...checked, ref: form.ref },
        request.ip ?? null,
        this.env.WEBSITE_ENQUIRIES_PER_10_MIN,
      );
    } catch (error) {
      if (error instanceof AppError && error.status === 429) {
        return this.again(res, campaign, form, error.message, 429);
      }
      throw error;
    }
    html(res);
    return renderThanks(brand);
  }

  @Get('go/:code/privacy')
  async privacy(@Res({ passthrough: true }) res: Response): Promise<string> {
    const company = await companyInfo(this.db);
    html(res);
    return renderPrivacy(company);
  }

  private async view(
    campaign: NonNullable<Awaited<ReturnType<typeof openCampaign>>>,
    ref: string | null,
    extra: Partial<LandingView> = {},
  ): Promise<LandingView> {
    const [{ brand }, number] = [
      await companyInfo(this.db),
      await businessWhatsAppNumber(this.env),
    ];
    return {
      brand,
      code: campaign.code,
      // Absolute: behind the proxy the API lives under /api, so root paths would miss it.
      pageUrl: landingPageUrl(this.env.API_PUBLIC_URL, campaign.code),
      text: campaign.text,
      media: campaign.media
        ? {
            kind: campaign.media.kind,
            path: mediaPublicUrl(this.env.API_PUBLIC_URL, campaign.media.id),
          }
        : null,
      whatsappDigits: number ? number.replace(/\D/g, '') : null,
      ref,
      city: campaign.city,
      ...extra,
    };
  }

  private async again(
    res: Response,
    campaign: NonNullable<Awaited<ReturnType<typeof openCampaign>>>,
    form: { name: string; phone: string; city: string; ref: string },
    error: string,
    status: number,
  ): Promise<string> {
    html(res, status);
    return renderLanding(
      await this.view(campaign, form.ref || null, {
        error,
        values: { name: form.name, phone: form.phone, city: form.city },
      }),
    );
  }

  private async ended(res: Response): Promise<string> {
    const { brand, phone } = await companyInfo(this.db);
    html(res, 404);
    return renderEnded(brand, phone);
  }
}
