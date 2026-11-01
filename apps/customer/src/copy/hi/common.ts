/**
 * Hindi copy for the OneOhm customer app: the same shape as `../en/common.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/common';

export const COMMON: Copy<typeof en.COMMON> = {
  appName: 'OneOhm',
  loading: 'लोड हो रहा है',
  retry: 'फिर से कोशिश करें',
  loadError: 'यह खुल नहीं पाया',
  back: 'वापस',
  close: 'बंद करें',
  cancel: 'रद्द करें',
  send: 'भेजें',
  optional: 'ज़रूरी नहीं',
  tabs: {
    home: 'होम',
    payments: 'पेमेंट',
    documents: 'दस्तावेज़',
    support: 'मदद',
    profile: 'मैं',
  },
  stages: {
    survey: 'साइट विज़िट',
    design: 'सिस्टम डिज़ाइन',
    material: 'सामान',
    installation: 'पैनल लगाना',
    commissioning: 'सिस्टम चालू करना',
    net_metering: 'नेट मीटर',
    subsidy: 'सब्सिडी',
  },
  projectType: { residential: 'घर', society: 'हाउसिंग सोसाइटी', commercial: 'बिज़नेस' },
  reconnect: {
    title: 'OneOhm से जुड़ नहीं पा रहे',
    body: 'आप अभी भी साइन इन हैं। इंटरनेट चेक करें, फिर दोबारा कोशिश करें।',
    signOut: 'इसके बजाय साइन आउट करें',
  },
};

export const SIGN_IN: Copy<typeof en.SIGN_IN> = {
  logoLabel: 'OneOhm — सबके लिए ऊर्जा',
  hello: {
    morning: 'सुप्रभात',
    midday: 'नमस्ते',
    evening: 'शुभ संध्या',
    night: 'शुभ संध्या',
  },
  line: {
    morning: 'आपकी छत अब कमाई शुरू करने वाली है।',
    midday: 'आपके घर पर तेज़ धूप है।',
    evening: 'पैनलों पर दिन की आख़िरी रोशनी।',
    night: 'कल की धूप रास्ते में है।',
  },
  form: {
    title: 'OneOhm में आपका स्वागत है',
    description: 'अपना सोलर प्रोजेक्ट, पेमेंट और कागज़ एक ही जगह देखें।',
    phoneLabel: 'मोबाइल नंबर',
    phoneHint: 'बुकिंग के समय OneOhm को दिया गया नंबर।',
    sendCode: 'मुझे कोड भेजें',
    codeTitle: 'अपना कोड डालें',
    codeSentTo: (phone) => `${phone} पर 6 अंकों का कोड भेजा गया है।`,
    codeLabel: '6 अंकों का कोड',
    verify: 'आगे बढ़ें',
    changeNumber: 'नंबर बदलें',
    resend: 'नया कोड भेजें',
    resendIn: (seconds) => `${seconds} सेकंड में नया कोड`,
  },
  help: 'कोड नहीं आया? देख लें कि यह वही नंबर है जो OneOhm के कोटेशन पर है।',
  language: 'भाषा',
};

export const PROFILE: Copy<typeof en.PROFILE> = {
  title: 'मैं',
  phone: 'मोबाइल',
  email: 'ईमेल',
  refer: 'पड़ोसी को बताएँ',
  referHint: 'किसी को सोलर चाहिए? आगे का सब हम संभाल लेंगे।',
  company: 'OneOhm',
  call: 'OneOhm को फ़ोन करें',
  mail: 'OneOhm को ईमेल करें',
  signOut: 'साइन आउट',
  signOutHint: 'दोबारा साइन इन करने के लिए नया कोड लगेगा।',
  server: 'जुड़ा है:',
  language: 'भाषा',
  languageHint: 'ऐप और यहाँ के अपडेट इसी भाषा में दिखेंगे। WhatsApp मैसेज अभी अंग्रेज़ी में ही आएँगे।',
  languageNotSaved: 'इस फ़ोन पर बदल गई। इंटरनेट आने पर आपके खाते में सेव कर देंगे।',
};
