import { randomUUID } from 'node:crypto';
import type { MarketingMedia } from '@oneohm/api-contracts';
import { marketingMedia } from '@oneohm/database';
import type { DetectedFileType } from '@oneohm/domain';
import sharp from 'sharp';
import { type Actor, assertCan } from '../../../common/auth/actor';
import { invalid } from '../../../common/http/errors';
import { checkFile, type IncomingFile } from '../../documents/upload-file';
import type { CampaignContext } from './campaign-context';

/** Photos and videos a campaign can carry. */
export const CAMPAIGN_MEDIA_TYPES: readonly DetectedFileType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
];

/** Smallest short side that still looks sharp in an ad. */
export const MIN_PHOTO_EDGE = 600;

export const TOO_SMALL = 'This photo is too small. Use one at least 600 pixels wide.';
const UNREADABLE = 'This photo could not be read. Save it as a JPEG and try again.';

/** The short side of a photo is too small for an ad. */
export const photoTooSmall = (width: number, height: number) =>
  Math.min(width, height) < MIN_PHOTO_EDGE;

/**
 * A JPEG of the photo, turned upright, flattened on white and stripped of its location data.
 * PNG, WebP and HEIC all become JPEG: Instagram and Google take nothing else reliably.
 */
export async function prepareImage(
  bytes: Buffer,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(bytes, { failOn: 'error', limitInputPixels: 120_000_000 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw invalid(UNREADABLE, { file: 'This photo could not be read.' });
  }
}

const baseName = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, '') || 'photo';

/** Checks and stores one campaign photo or video, and records it. */
export async function saveMedia(
  ctx: CampaignContext,
  actor: Actor,
  file: IncomingFile | undefined,
): Promise<MarketingMedia> {
  assertCan(actor, 'marketing.manage');
  const checked = checkFile(file, CAMPAIGN_MEDIA_TYPES);
  const isPhoto = checked.contentType.startsWith('image/');
  let buffer = checked.buffer;
  let contentType: string = checked.contentType;
  let extension = checked.keyName.split('.').pop() ?? 'bin';
  let width: number | null = null;
  let height: number | null = null;
  if (isPhoto) {
    const photo = await prepareImage(checked.buffer);
    if (photoTooSmall(photo.width, photo.height)) throw invalid(TOO_SMALL, { file: TOO_SMALL });
    ({ buffer, width, height } = photo);
    contentType = 'image/jpeg';
    extension = 'jpg';
    if (buffer.length > 25 * 1024 * 1024) {
      throw invalid('This photo is larger than 25 MB.', { file: 'Too large.' });
    }
  }
  const storageKey = `marketing/${randomUUID()}.${extension}`;
  await ctx.storage.put(storageKey, buffer, contentType);
  try {
    const [row] = await ctx.db
      .insert(marketingMedia)
      .values({
        storageKey,
        kind: isPhoto ? 'image' : 'video',
        contentType,
        fileName: `${baseName(checked.name)}.${extension}`,
        sizeBytes: buffer.length,
        width,
        height,
        uploadedByUserId: actor.userId,
      })
      .returning({ id: marketingMedia.id });
    if (!row) throw new Error('Media insert returned nothing');
    return {
      id: row.id,
      kind: isPhoto ? 'image' : 'video',
      url: `/m/${row.id}`,
      width,
      height,
    };
  } catch (error) {
    await ctx.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}
