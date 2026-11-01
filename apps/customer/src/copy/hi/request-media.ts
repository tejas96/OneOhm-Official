/**
 * Hindi copy for a help request's voice note and short video: the same shape as
 * `../en/request-media.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/request-media';

export const REQUEST_MEDIA: Copy<typeof en.REQUEST_MEDIA> = {
  voiceLabel: 'वॉइस नोट',
  voiceHint: (minutes) => `ज़रूरी नहीं। लिखने के बजाय बोलकर बताएँ कि क्या हो रहा है, ${minutes} मिनट तक।`,
  record: 'वॉइस नोट रिकॉर्ड करें',
  stop: 'रिकॉर्डिंग रोकें',
  recording: 'रिकॉर्डिंग चल रही है। हो जाए तो रोकें दबाएँ।',
  play: 'वॉइस नोट सुनें',
  pause: 'वॉइस नोट रोकें',
  removeVoice: 'वॉइस नोट हटाएँ',
  micDenied: 'रिकॉर्ड करने के लिए फ़ोन की सेटिंग में OneOhm को माइक्रोफ़ोन की अनुमति दें।',
  recordFailed: 'रिकॉर्डिंग शुरू नहीं हुई। फिर से कोशिश करें।',
  voiceOnWeb: 'वॉइस नोट आपके फ़ोन के OneOhm ऐप से रिकॉर्ड कर सकते हैं।',
  videoLabel: 'छोटा वीडियो',
  videoHint: (seconds) => `ज़रूरी नहीं। ${seconds} सेकंड तक, कोई आवाज़ या जलती-बुझती बत्ती दिखाने के लिए।`,
  recordVideo: 'वीडियो रिकॉर्ड करें',
  chooseVideo: 'वीडियो चुनें',
  removeVideo: 'वीडियो हटाएँ',
  videoReady: 'वीडियो जुड़ गया',
  videoTooLong: (seconds) => `यह वीडियो ${seconds} सेकंड से लंबा है। छोटा वीडियो चुनें।`,
  videoTooLarge: 'यह वीडियो बहुत बड़ा है। छोटा वीडियो रिकॉर्ड करें।',
  filesFailed: (count) =>
    count === 1
      ? 'भेज दिया, पर 1 फ़ाइल अपलोड नहीं हो पाई।'
      : `भेज दिया, पर ${count} फ़ाइलें अपलोड नहीं हो पाईं।`,
  hasVideo: 'वीडियो',
  hasVoiceNote: 'वॉइस नोट',
  visitOn: (date) => `टेक्नीशियन की विज़िट: ${date}`,
  spokenDescription: 'वॉइस नोट में बताया है।',
};
