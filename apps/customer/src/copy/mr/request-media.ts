/**
 * Marathi copy for a help request's voice note and short video: the same shape as
 * `../en/request-media.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/request-media';

export const REQUEST_MEDIA: Copy<typeof en.REQUEST_MEDIA> = {
  voiceLabel: 'व्हॉइस नोट',
  voiceHint: (minutes) => `हवे असल्यास. लिहिण्याऐवजी काय होत आहे ते बोलून सांगा, ${minutes} मिनिटांपर्यंत.`,
  record: 'व्हॉइस नोट रेकॉर्ड करा',
  stop: 'रेकॉर्डिंग थांबवा',
  recording: 'रेकॉर्डिंग सुरू आहे. झाल्यावर थांबवा दाबा.',
  play: 'व्हॉइस नोट ऐका',
  pause: 'व्हॉइस नोट थांबवा',
  removeVoice: 'व्हॉइस नोट काढून टाका',
  micDenied: 'रेकॉर्ड करण्यासाठी फोनच्या सेटिंगमध्ये OneOhm ला मायक्रोफोनची परवानगी द्या.',
  recordFailed: 'रेकॉर्डिंग सुरू झाले नाही. पुन्हा प्रयत्न करा.',
  voiceOnWeb: 'व्हॉइस नोट तुमच्या फोनवरील OneOhm ॲपमधून रेकॉर्ड करता येते.',
  videoLabel: 'छोटा व्हिडिओ',
  videoHint: (seconds) =>
    `हवे असल्यास. ${seconds} सेकंदांपर्यंत, एखादा आवाज किंवा लुकलुकणारा दिवा दाखवण्यासाठी.`,
  recordVideo: 'व्हिडिओ रेकॉर्ड करा',
  chooseVideo: 'व्हिडिओ निवडा',
  removeVideo: 'व्हिडिओ काढून टाका',
  videoReady: 'व्हिडिओ जोडला',
  videoTooLong: (seconds) => `हा व्हिडिओ ${seconds} सेकंदांपेक्षा मोठा आहे. छोटा व्हिडिओ निवडा.`,
  videoTooLarge: 'हा व्हिडिओ खूप मोठा आहे. छोटा व्हिडिओ रेकॉर्ड करा.',
  notUploaded: (what) => `पाठवले. हे अपलोड झाले नाही: ${what}. टीमचा फोन आल्यावर त्यांना दाखवा.`,
  failedVideo: 'व्हिडिओ',
  failedVoice: 'व्हॉइस नोट',
  hasVideo: 'व्हिडिओ',
  hasVoiceNote: 'व्हॉइस नोट',
  visitOn: (date) => `तंत्रज्ञाची भेट: ${date}`,
  spokenDescription: 'व्हॉइस नोटमध्ये सांगितले आहे.',
};
