import { PlatformError } from '../errors';
import type { LaunchMedia } from '../types';
import type { Graph } from './meta-graph';
import type { Sleep } from './meta-sleep';

const VIDEO_WAIT_MS = 90_000;
const VIDEO_STEP_MS = 3_000;

/** Uploads a photo and returns Meta's image hash. */
export async function uploadImage(graph: Graph, adAccountId: string, media: LaunchMedia) {
  const bytes = await media.bytes();
  const reply = await graph.post<{ images?: Record<string, { hash: string }> }>(
    `${adAccountId}/adimages`,
    { bytes: bytes.toString('base64') },
  );
  const hash = Object.values(reply.images ?? {})[0]?.hash;
  if (!hash) throw new PlatformError('invalid', 'Meta did not accept the photo. Try another one.');
  return hash;
}

/** Sends a video by link; Meta fetches it from our public route. */
export async function uploadVideo(graph: Graph, adAccountId: string, media: LaunchMedia) {
  const reply = await graph.post<{ id: string }>(`${adAccountId}/advideos`, {
    file_url: media.publicUrl,
  });
  return reply.id;
}

/** Waits until Meta has processed the video. */
export async function waitForVideo(graph: Graph, videoId: string, sleep: Sleep): Promise<void> {
  for (let waited = 0; waited <= VIDEO_WAIT_MS; waited += VIDEO_STEP_MS) {
    const reply = await graph.get<{ status?: { video_status?: string } }>(videoId, {
      fields: 'status',
    });
    const status = reply.status?.video_status;
    if (status === 'ready') return;
    if (status === 'error') {
      throw new PlatformError('invalid', 'Meta could not read the video. Try another file.');
    }
    await sleep(VIDEO_STEP_MS);
  }
  throw new PlatformError(
    'temporary',
    'Meta is still getting the video ready. Try again in a minute.',
  );
}

/** The video's cover picture link (Meta's preferred one). */
export async function videoThumbnail(graph: Graph, videoId: string): Promise<string> {
  const reply = await graph.get<{ data?: { uri: string; is_preferred?: boolean }[] }>(
    `${videoId}/thumbnails`,
  );
  const pick = reply.data?.find((t) => t.is_preferred) ?? reply.data?.[0];
  if (!pick) {
    throw new PlatformError(
      'temporary',
      'Meta is still getting the video ready. Try again in a minute.',
    );
  }
  return pick.uri;
}
