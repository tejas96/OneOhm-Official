import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

/**
 * Voice notes as small AAC (M4A) files that every browser plays: mono speech at 48 kbps
 * is about 0.7 MB for two minutes. The web preview records WebM (Opus), which is what
 * browsers' recorders make.
 */
export const VOICE_NOTE_PRESET: RecordingOptions = {
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
  // `bitRate` above becomes the browser recorder's audio bit rate.
  web: { mimeType: 'audio/webm' },
};

/** The upload's type from what the recorder made ("audio/webm;codecs=opus" → "audio/webm"). */
export function voiceTypeOf(blobType?: string): string {
  return blobType?.split(';')[0]?.trim() || 'audio/mp4';
}

export const extensionOfVoice = (type: string) =>
  type === 'audio/webm' ? 'weba' : type === 'audio/ogg' ? 'ogg' : 'm4a';
