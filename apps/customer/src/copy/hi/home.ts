import { CHAT_OPENERS } from '@oneohm/domain';
/**
 * Hindi copy for Home and the solar journey: the same shape as `../en/home.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/home';

export const STAGE_MEANING: Copy<typeof en.STAGE_MEANING> = {
  survey: 'हमारे इंजीनियर आकर आपकी छत नापते हैं और मीटर चेक करते हैं।',
  design: 'हम तय करते हैं कि कौन-सा पैनल कहाँ लगेगा और आपका सिस्टम फ़ाइनल करते हैं।',
  material: 'पैनल, इन्वर्टर और स्ट्रक्चर मँगाकर जाँचे जाते हैं।',
  installation: 'हमारी टीम स्ट्रक्चर, पैनल और वायरिंग लगाती है।',
  commissioning: 'हम सब कुछ जाँचकर आपका सिस्टम चालू करते हैं।',
  net_metering: 'बिजली बोर्ड जाँच करके आपका नेट मीटर लगाता है।',
  subsidy: 'हम सरकारी सब्सिडी की अर्ज़ी देते हैं और आपके बैंक तक पहुँचने तक फ़ॉलो-अप करते हैं।',
};

export const MILESTONE: Copy<typeof en.MILESTONE> = {
  site_survey: 'साइट विज़िट और छत की नाप',
  site_survey_society: 'साइट विज़िट और छत की नाप',
  site_survey_commercial: 'साइट विज़िट और छत की नाप',
  site_survey_ground: 'साइट विज़िट और ज़मीन की नाप',
  name_change: 'बिजली कनेक्शन में नाम बदलना',
  system_design: 'आपके सिस्टम का डिज़ाइन मंज़ूर हुआ',
  loan_approval: 'बैंक लोन मंज़ूर हुआ',
  discom_application: 'बिजली बोर्ड में नेट मीटर की अर्ज़ी दी गई',
  dispatch_material: 'सामान आपके घर के लिए निकल चुका है',
  structure_installation: 'पैनल का स्ट्रक्चर लग गया',
  installation_complete: 'फ़िटिंग पूरी हुई और जाँच हो गई',
  testing_commissioning: 'सिस्टम जाँचकर चालू किया गया',
  discom_inspection: 'बिजली बोर्ड की जाँच',
  net_meter_installation: 'नेट मीटर लग गया',
  handover: 'सिस्टम सौंपा गया, वारंटी के कागज़',
  subsidy_application: 'पीएम सूर्य घर पोर्टल पर सब्सिडी की अर्ज़ी दी गई',
  subsidy_inspection: 'सब्सिडी के लिए जाँच मंज़ूर हुई',
  subsidy_release: 'सब्सिडी आपके बैंक खाते में आ गई',
};

export const HOME: Copy<typeof en.HOME> = {
  greeting: {
    morning: 'सुप्रभात',
    midday: 'नमस्ते',
    evening: 'शुभ संध्या',
    night: 'शुभ संध्या',
  },
  loading: 'आपकी सोलर यात्रा लोड हो रही है',
  noProjectTitle: 'आपका प्रोजेक्ट यहाँ दिखेगा',
  noProjectBody: 'अपना कोटेशन मानकर प्रोजेक्ट शुरू होते ही आप हर कदम यहाँ देख सकेंगे।',
  system: (kwp, place) => `${kwp} सोलर · ${place}`,
  journeyTitle: 'आपकी सोलर यात्रा',
  stageCount: (done, total) => `${total} में से ${done} कदम पूरे`,
  live: 'आपका सिस्टम चालू है',
  liveBody: (company) => `यह आपके घर के लिए बिजली बना रहा है। ${company} चुनने के लिए धन्यवाद।`,
  now: 'अभी',
  skipped: 'आपके घर के लिए ज़रूरी नहीं',
  nextTitle: 'आगे क्या होगा',
  nextOn: (date) => `तय तारीख: ${date}`,
  nothingNext: 'अगला कदम जल्द बताएँगे।',
  waiting: {
    customer: 'आपका इंतज़ार है',
    bank: 'बैंक का इंतज़ार है',
    discom: 'बिजली बोर्ड का इंतज़ार है',
  },
  waitingBody: {
    customer: 'आपके संपर्क को आपसे कुछ चाहिए। कृपया उन्हें फ़ोन करें।',
    bank: 'आपकी लोन फ़ाइल बैंक के पास है। फ़ॉलो-अप हम कर रहे हैं।',
    discom: 'बिजली बोर्ड आपकी अर्ज़ी देख रहा है। फ़ॉलो-अप हम कर रहे हैं।',
  },
  waitingSince: (date) => `${date} से`,
  updatesTitle: 'हाल के अपडेट',
  noUpdates: 'हर कदम पूरा होने पर यहाँ दिखेगा।',
  switcher: 'आपके घर',
  subsidyTitle: 'सरकारी सब्सिडी',
  subsidy: {
    pending: 'नेट मीटर लगने के बाद हम अर्ज़ी देंगे।',
    applied: 'पीएम सूर्य घर पोर्टल पर अर्ज़ी दी गई है। सरकार इसे सीधे आपके बैंक में भेजती है।',
    inspected: 'जाँच मंज़ूर हो गई। अब सरकार इसे आपके बैंक में भेजेगी।',
    released: 'आपके बैंक खाते में आ गई।',
    not_applicable: 'इस प्रोजेक्ट पर लागू नहीं।',
  },
  /** What the customer told us about a released subsidy (the same as the WhatsApp Project update). */
  subsidyNote: {
    received: 'आपके बैंक खाते में आ गई ✅',
    checking: 'आपने बताया कि यह अभी नहीं आई। हम सरकार से पूछताछ कर रहे हैं।',
  },
  subsidyNoteStatus: { received: 'मिल गई', checking: 'जाँच रहे हैं' },
  subsidyStatus: {
    pending: 'अभी अर्ज़ी नहीं दी',
    applied: 'अर्ज़ी दी गई',
    inspected: 'जाँच हो गई',
    released: 'आ गई',
  },
  contactTitle: 'आपके संपर्क',
  contactFallback: (company) => `${company} टीम`,
  call: 'फ़ोन करें',
  whatsapp: 'WhatsApp',
  /** Sent to the business number; the assistant hands it to the contact person. */
  talkToPerson: CHAT_OPENERS.talkToPerson.hi,
  referTitle: 'किसी को सोलर चाहिए?',
  referBody: 'पड़ोसी या दोस्त का नाम बताएँ। हम उन्हें फ़ोन करेंगे और आपको बताते रहेंगे।',
  referAction: 'नाम बताएँ',
  feedbackTitle: 'हमारा काम कैसा लगा?',
  feedbackBody: 'आपकी रेटिंग से हमारी टीम अगले घर के लिए और अच्छा काम करेगी।',
  feedbackAction: 'अपना अनुभव बताएँ',
  feedbackThanks: 'रेटिंग के लिए धन्यवाद।',
  todoTitle: 'आपके करने के काम',
  todoPay: 'भरें',
  todoSee: 'देखें',
  todoSend: 'भेजें',
  todoRate: 'रेटिंग दें',
  todoPaymentMeta: (amount) => `${amount} देने हैं`,
  todoPaperMeta: 'हमें आपसे यह कागज़ चाहिए',
  todoRatingMeta: 'बस कुछ सेकंड लगेंगे।',
  todoFeedback: 'आपका सोलर अनुभव कैसा रहा?',
  todoPayFailed: 'पेमेंट का पेज नहीं खुला। दोबारा कोशिश करें।',
};
