import { MAX_VIDEO_BYTES, VIDEO_MAX_SECONDS } from '@oneohm/domain';
import type { UploadableFile } from '@oneohm/mobile-ui';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';

export type VideoSource = 'camera' | 'library';

/** The picked video, or why there is none (null when the customer cancelled). */
export type VideoPick =
  | { readonly file: UploadableFile; readonly seconds: number | null }
  | 'denied'
  | 'tooLong'
  | 'tooLarge'
  | null;

/** A little slack: phones round a 60-second recording to 60.4 s. */
const SLACK_MS = 1_500;

/**
 * Records a short video (the camera stops at one minute, medium quality so the file
 * stays small) or picks one from the gallery, refusing one that is too long or too big.
 * The same settings as the field app's site videos.
 */
export async function pickRequestVideo(source: VideoSource): Promise<VideoPick> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return 'denied';
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: VIDEO_MAX_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    allowsMultipleSelection: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const length = asset.duration ?? 0;
  if (length > VIDEO_MAX_SECONDS * 1000 + SLACK_MS) return 'tooLong';
  if ((asset.fileSize ?? asset.file?.size ?? 0) > MAX_VIDEO_BYTES) return 'tooLarge';
  const type = asset.mimeType ?? asset.file?.type ?? 'video/mp4';
  const extension = type === 'video/quicktime' ? 'mov' : type === 'video/webm' ? 'webm' : 'mp4';
  return {
    file: {
      uri: asset.uri,
      name: asset.fileName ?? `problem-video-${Date.now()}.${extension}`,
      type,
      ...(asset.file ? { file: asset.file } : {}),
    },
    seconds: length > 0 ? Math.round(length / 1000) : null,
  };
}

/**
 * Voice notes as small AAC (M4A) files that every browser plays: mono speech at 48 kbps
 * is about 0.7 MB for two minutes (the field app's settings).
 */
export const VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 48_000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm' },
};

/** The recorded note, ready to upload once the request is raised. */
export const voiceFileOf = (uri: string): UploadableFile => ({
  uri,
  name: `voice-note-${Date.now()}.m4a`,
  type: 'audio/mp4',
});

/** "0:42": a length or a position in seconds. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
