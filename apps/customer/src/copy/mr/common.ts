/**
 * Marathi copy for the OneOhm customer app: the same shape as `../en/common.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/common';

export const COMMON: Copy<typeof en.COMMON> = {
  appName: 'OneOhm',
  loading: 'लोड होत आहे',
  retry: 'पुन्हा प्रयत्न करा',
  loadError: 'हे उघडता आले नाही',
  back: 'मागे',
  close: 'बंद करा',
  cancel: 'रद्द करा',
  send: 'पाठवा',
  optional: 'हवे असल्यास',
  tabs: {
    home: 'होम',
    payments: 'पेमेंट',
    documents: 'कागदपत्रे',
    support: 'मदत',
    profile: 'मी',
  },
  stages: {
    survey: 'साईट भेट',
    design: 'सिस्टिमचे डिझाइन',
    material: 'साहित्य',
    installation: 'पॅनल बसवणे',
    commissioning: 'सिस्टिम सुरू करणे',
    net_metering: 'नेट मीटर',
    subsidy: 'सबसिडी',
  },
  projectType: { residential: 'घर', society: 'हाउसिंग सोसायटी', commercial: 'व्यवसाय' },
  reconnect: {
    title: 'OneOhm शी संपर्क होत नाही',
    body: 'तुम्ही अजून साइन इन आहात. इंटरनेट चालू आहे का ते पाहा आणि पुन्हा प्रयत्न करा.',
    signOut: 'त्याऐवजी साइन आउट करा',
  },
};

export const SIGN_IN: Copy<typeof en.SIGN_IN> = {
  logoLabel: 'OneOhm — सर्वांसाठी ऊर्जा',
  hello: {
    morning: 'शुभ सकाळ',
    midday: 'नमस्कार',
    evening: 'शुभ संध्याकाळ',
    night: 'शुभ संध्याकाळ',
  },
  line: {
    morning: 'तुमचे छत आता कमाई करायला तयार आहे.',
    midday: 'तुमच्या घरावर भरपूर ऊन आहे.',
    evening: 'पॅनलवर दिवसाचा शेवटचा प्रकाश.',
    night: 'उद्याचे ऊन लवकरच येईल.',
  },
  form: {
    title: 'OneOhm मध्ये स्वागत आहे',
    description: 'तुमचा सोलर प्रकल्प, पेमेंट आणि कागदपत्रे एकाच ठिकाणी पाहा.',
    phoneLabel: 'मोबाईल नंबर',
    phoneHint: 'बुकिंगच्या वेळी OneOhm ला दिलेला नंबर.',
    sendCode: 'मला कोड पाठवा',
    codeTitle: 'तुमचा कोड टाका',
    codeSentTo: (phone) => `${phone} वर 6 अंकी कोड पाठवला आहे.`,
    codeLabel: '6 अंकी कोड',
    verify: 'पुढे चला',
    changeNumber: 'नंबर बदला',
    resend: 'नवीन कोड पाठवा',
    resendIn: (seconds) => `${seconds} सेकंदांनी नवीन कोड`,
  },
  help: 'कोड आला नाही? OneOhm च्या कोटेशनवरचाच नंबर टाकला आहे ना, ते पाहा.',
  language: 'भाषा',
};

export const PROFILE: Copy<typeof en.PROFILE> = {
  title: 'मी',
  phone: 'मोबाईल',
  refer: 'शेजाऱ्याला सुचवा',
  referHint: 'कोणाला सोलर हवा आहे? पुढचे सगळे आम्ही पाहू.',
  call: (company) => `${company} ला फोन करा`,
  whatsapp: (company) => `${company} ला WhatsApp करा`,
  signOut: 'साइन आउट',
  signOutHint: 'पुन्हा साइन इन करण्यासाठी नवीन कोड लागेल.',
  server: 'जोडलेले:',
  language: 'भाषा',
  languageHint: 'ॲप आणि अपडेट्स याच भाषेत दिसतील. WhatsApp मेसेजही, जिथे ते या भाषेत तयार आहेत तिथे.',
  languageNotSaved: 'या फोनवर बदलली. इंटरनेट आल्यावर तुमच्या खात्यात सेव्ह करू.',
};
