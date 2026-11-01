/**
 * Marathi copy for Home and the solar journey: the same shape as `../en/home.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/home';

export const STAGE_MEANING: Copy<typeof en.STAGE_MEANING> = {
  survey: 'आमचे इंजिनिअर येऊन तुमचे छत मोजतात आणि मीटर तपासतात.',
  design: 'कोणता पॅनल कुठे बसेल ते ठरवून तुमची सिस्टिम पक्की करतो.',
  material: 'पॅनल, इन्व्हर्टर आणि स्ट्रक्चर मागवून तपासले जातात.',
  installation: 'आमची टीम स्ट्रक्चर, पॅनल आणि वायरिंग बसवते.',
  commissioning: 'सगळे तपासून तुमची सिस्टिम सुरू करतो.',
  net_metering: 'वीज मंडळ तपासणी करून तुमचा नेट मीटर बसवते.',
  subsidy: 'सरकारी सबसिडीसाठी अर्ज करतो आणि ती तुमच्या बँकेत येईपर्यंत पाठपुरावा करतो.',
};

export const MILESTONE: Copy<typeof en.MILESTONE> = {
  site_survey: 'साईट भेट आणि छताचे मोजमाप',
  site_survey_society: 'साईट भेट आणि छताचे मोजमाप',
  site_survey_commercial: 'साईट भेट आणि छताचे मोजमाप',
  site_survey_ground: 'साईट भेट आणि जमिनीचे मोजमाप',
  name_change: 'वीज कनेक्शनवरील नाव बदल',
  system_design: 'तुमच्या सिस्टिमचे डिझाइन मंजूर झाले',
  loan_approval: 'बँकेचे कर्ज मंजूर झाले',
  discom_application: 'नेट मीटरचा अर्ज वीज मंडळाकडे दिला',
  dispatch_material: 'साहित्य तुमच्या घराकडे निघाले आहे',
  structure_installation: 'पॅनलचे स्ट्रक्चर बसवले',
  installation_complete: 'बसवण्याचे काम पूर्ण झाले आणि तपासले',
  testing_commissioning: 'सिस्टिम तपासून सुरू केली',
  discom_inspection: 'वीज मंडळाची तपासणी',
  net_meter_installation: 'नेट मीटर बसवला',
  handover: 'सिस्टिम ताब्यात दिली, वॉरंटीची कागदपत्रे',
  subsidy_application: 'पीएम सूर्य घर पोर्टलवर सबसिडीचा अर्ज केला',
  subsidy_inspection: 'सबसिडीसाठी तपासणी मंजूर झाली',
  subsidy_release: 'सबसिडी तुमच्या बँक खात्यात जमा झाली',
};

export const HOME: Copy<typeof en.HOME> = {
  greeting: {
    morning: 'शुभ सकाळ',
    midday: 'नमस्कार',
    evening: 'शुभ संध्याकाळ',
    night: 'शुभ संध्याकाळ',
  },
  loading: 'तुमचा सोलर प्रवास लोड होत आहे',
  noProjectTitle: 'तुमचा प्रकल्प इथे दिसेल',
  noProjectBody: 'OneOhm चे कोटेशन स्वीकारून प्रकल्प सुरू झाला की प्रत्येक टप्पा तुम्हाला इथे पाहता येईल.',
  system: (kwp, place) => `${kwp} सोलर · ${place}`,
  journeyTitle: 'तुमचा सोलर प्रवास',
  stageCount: (done, total) => `${total} पैकी ${done} टप्पे पूर्ण`,
  live: 'तुमची सिस्टिम सुरू झाली आहे',
  liveBody: 'ती तुमच्या घरासाठी वीज तयार करत आहे. OneOhm निवडल्याबद्दल धन्यवाद.',
  now: 'आता',
  skipped: 'तुमच्या घरासाठी याची गरज नाही',
  nextTitle: 'पुढे काय होणार',
  nextOn: (date) => `ठरलेली तारीख: ${date}`,
  nothingNext: 'पुढचा टप्पा लवकरच कळवू.',
  waiting: {
    customer: 'तुमची वाट पाहत आहोत',
    bank: 'बँकेची वाट पाहत आहोत',
    discom: 'वीज मंडळाची वाट पाहत आहोत',
  },
  waitingBody: {
    customer: 'तुमच्या OneOhm संपर्क व्यक्तीला तुमच्याकडून काहीतरी हवे आहे. कृपया त्यांना फोन करा.',
    bank: 'तुमची कर्जाची फाईल बँकेकडे आहे. पाठपुरावा आम्ही करत आहोत.',
    discom: 'वीज मंडळ तुमचा अर्ज पाहत आहे. पाठपुरावा आम्ही करत आहोत.',
  },
  waitingSince: (date) => `${date} पासून`,
  updatesTitle: 'अलीकडच्या घडामोडी',
  noUpdates: 'प्रत्येक टप्पा पूर्ण झाला की इथे दिसेल.',
  switcher: 'तुमची घरे',
  subsidyTitle: 'सरकारी सबसिडी',
  subsidy: {
    pending: 'नेट मीटर बसवल्यावर आम्ही अर्ज करू.',
    applied: 'पीएम सूर्य घर पोर्टलवर अर्ज केला आहे. सरकार ती थेट तुमच्या बँकेत जमा करते.',
    inspected: 'तपासणी मंजूर झाली. आता सरकार ती तुमच्या बँकेत जमा करेल.',
    released: 'तुमच्या बँक खात्यात जमा झाली.',
    not_applicable: 'या प्रकल्पाला लागू नाही.',
  },
  subsidyStatus: {
    pending: 'अजून अर्ज केला नाही',
    applied: 'अर्ज केला',
    inspected: 'तपासणी झाली',
    released: 'जमा झाली',
  },
  contactTitle: 'तुमचे OneOhm संपर्क',
  contactFallback: 'OneOhm टीम',
  call: 'फोन करा',
  whatsapp: 'WhatsApp',
  referTitle: 'कोणाला सोलर हवा आहे?',
  referBody: 'शेजारी किंवा मित्रांना सुचवा. आम्ही त्यांना फोन करू आणि तुम्हाला कळवत राहू.',
  referAction: 'नाव सुचवा',
  feedbackTitle: 'आमचे काम कसे वाटले?',
  feedbackBody: 'तुमच्या रेटिंगमुळे पुढच्या घरासाठी आमची टीम अजून चांगले काम करेल.',
  feedbackAction: 'तुमचा अनुभव सांगा',
  feedbackThanks: 'रेटिंगबद्दल धन्यवाद.',
  todoTitle: 'तुम्ही करायच्या गोष्टी',
  todoPay: 'भरा',
  todoSee: 'पाहा',
  todoSend: 'पाठवा',
  todoRate: 'रेटिंग द्या',
  todoPaymentMeta: (amount) => `${amount} भरायचे आहेत`,
  todoPaperMeta: 'OneOhm ला तुमच्याकडून हा कागद हवा आहे',
  todoRatingMeta: 'फक्त काही सेकंद लागतील.',
  todoFeedback: 'तुमचा सोलरचा अनुभव कसा होता?',
  todoPayFailed: 'पेमेंटचे पान उघडले नाही. पुन्हा प्रयत्न करा.',
};
