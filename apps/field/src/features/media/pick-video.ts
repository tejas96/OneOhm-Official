import { MAX_VIDEO_BYTES, VIDEO_MAX_SECONDS } from '@oneohm/domain';
import type { UploadableFile } from '@oneohm/mobile-ui';
import * as ImagePicker from 'expo-image-picker';
import { readLocation } from '@/features/attendance/location';
import type { Geotag } from '@/features/uploads/queue-logic';

export type VideoSource = 'camera' | 'library';

export interface PickedVideo {
  readonly file: UploadableFile;
  readonly geotag: Geotag | null;
}

export type VideoPick = PickedVideo | 'denied' | 'tooLong' | 'tooLarge' | null;

/** A second of slack: phones round a 60-second recording to 60.4 s. */
const SLACK_MS = 1_500;

/**
 * Where and when a video was recorded (PRD 4.2): with location allowed (consent, working
 * hours), the phone's position at capture; otherwise only the time. Gallery videos carry
 * no EXIF the picker reads, so they keep nothing.
 */
async function tagOf(source: VideoSource, locate: boolean): Promise<Geotag | null> {
  if (source === 'library') return null;
  const takenAt = new Date().toISOString();
  const fix = locate ? await readLocation() : null;
  if (fix && fix !== 'denied') return { ...fix, takenAt, source: 'device' };
  return { latitude: null, longitude: null, takenAt, source: 'device' };
}

/**
 * Records a short video (the camera stops at one minute, medium quality so the file
 * stays small) or picks one from the gallery, refusing one that is too long or too big.
 * Resolves null when cancelled.
 */
export async function pickVideo(source: VideoSource, locate = false): Promise<VideoPick> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: VIDEO_MAX_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    // iOS re-encodes a gallery video at medium quality before handing it over.
    videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    allowsMultipleSelection: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if ((asset.duration ?? 0) > VIDEO_MAX_SECONDS * 1000 + SLACK_MS) return 'tooLong';
  const size = asset.fileSize ?? asset.file?.size ?? 0;
  if (size > MAX_VIDEO_BYTES) return 'tooLarge';
  const type = asset.mimeType ?? asset.file?.type ?? 'video/mp4';
  const extension = type === 'video/quicktime' ? 'mov' : type === 'video/webm' ? 'webm' : 'mp4';
  return {
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `site-video-${Date.now()}.${extension}`,
      type,
      ...(asset.file ? { file: asset.file } : {}),
    },
    geotag: await tagOf(source, locate),
  };
}
