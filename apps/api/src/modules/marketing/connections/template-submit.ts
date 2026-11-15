import { Logger } from '@nestjs/common';
import { companyProfile, messageTemplates } from '@oneohm/database';
import {
  MARKETING_MESSAGE_TEMPLATES,
  type MessageTemplateDefault,
  templateFieldText,
} from '@oneohm/domain';
import { errorDetail, plainError, submitWhatsAppTemplate } from '@oneohm/marketing';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { invalid } from '../../../common/http/errors';
import { ObjectStorageService } from '../../documents/object-storage.service';
import type { FlowDeps } from './connect-flow-types';
import { whatsappAccount } from './connections-summary';
import { approvePracticeTemplate } from './sandbox-templates';

const log = new Logger('MarketingTemplates');
const SAMPLE_MESSAGE = 'Get ₹78,000 subsidy on rooftop solar this month.';
const SAMPLE_LINK = 'https://g.page/r/example/review';

/** One example value per field: Meta wants a sample for each {{n}}. */
export const sampleFor = (field: string, brand: string): string =>
  ({ customer: 'Asha', company: brand, message: SAMPLE_MESSAGE, link: SAMPLE_LINK })[field] ??
  'Example';

/** The company logo on a square 800 × 800 PNG; a plain square when there is no logo. */
async function headerImage(deps: FlowDeps, logoKey: string | null): Promise<Buffer> {
  if (logoKey) {
    try {
      const bytes = await new ObjectStorageService(deps.env).getBuffer(logoKey);
      return await sharp(bytes)
        .resize(800, 800, { fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
    } catch {
      // A logo that cannot be read falls back to the plain square below.
    }
  }
  return sharp({
    create: { width: 800, height: 800, channels: 3, background: '#f59e0b' },
  })
    .png()
    .toBuffer();
}

/** Sends one marketing message to Meta for approval; approved at once switches it on. */
export async function submitMarketingTemplate(deps: FlowDeps, key: string): Promise<void> {
  const { db, config, env } = deps;
  const def = MARKETING_MESSAGE_TEMPLATES.find((t) => t.key === key) as
    | MessageTemplateDefault
    | undefined;
  if (!def) throw invalid('That is not one of the marketing messages.');
  const hasImage = Boolean(def.extras?.image);
  const [saved] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, key));
  const row = saved ?? {
    key,
    metaName: key,
    language: 'en',
    fields: [...def.fields],
    preview: def.preview,
  };
  const switchOn = async (withImage: boolean) => {
    const values = { active: true, extrasApproved: withImage, updatedAt: new Date() };
    await db
      .insert(messageTemplates)
      .values({
        key,
        audience: def.audience,
        metaName: row.metaName,
        language: row.language,
        fields: [...row.fields],
        preview: row.preview,
        ...values,
      })
      .onConflictDoUpdate({ target: messageTemplates.key, set: values });
  };
  // Practice mode never writes the real message rows: its approval lives in practice only.
  if (config.mode === 'sandbox') return approvePracticeTemplate(db, key, hasImage);
  const account = whatsappAccount(env, config.fetch);
  if (!account)
    throw invalid(
      'Set up WhatsApp first: add WHATSAPP_ACCESS_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID to the server settings.',
    );
  const [profile] = await db
    .select({ brand: companyProfile.brandName, logoKey: companyProfile.logoKey })
    .from(companyProfile)
    .limit(1);
  const brand = templateFieldText(profile?.brand ?? 'OneOhm');
  try {
    const result = await submitWhatsAppTemplate(account, {
      name: row.metaName,
      language: row.language,
      category: 'MARKETING',
      body: row.preview,
      examples: row.fields.map((field) => sampleFor(field, brand)),
      headerImage: hasImage
        ? { bytes: await headerImage(deps, profile?.logoKey ?? null), contentType: 'image/png' }
        : null,
    });
    const withImage = (result as { withImage?: boolean }).withImage === true;
    if (result.status === 'approved') await switchOn(withImage);
  } catch (error) {
    log.warn(`Template ${key}: ${errorDetail(error)}`);
    throw invalid(plainError(error));
  }
}
