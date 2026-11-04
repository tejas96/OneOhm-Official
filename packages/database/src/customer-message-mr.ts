/**
 * Marathi words for the customer's in-app alerts (PRD 5.1).
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { LanguageWords } from './customer-message-words';

const MR_STAGES: Readonly<Record<string, string>> = {
  survey: 'साइट सर्व्हे',
  installation: 'इन्स्टॉलेशन',
  commissioning: 'सिस्टिम सुरू करणे आणि हस्तांतरण',
};

/** Who a delayed step waits on, by the party key in the message. */
const MR_WAITING: Readonly<Record<string, string>> = {
  customer: 'तुमच्याकडून कागद किंवा उत्तर हवे आहे',
  bank: 'बँकेकडून उत्तराची वाट पाहत आहोत',
  discom: 'वीज मंडळाकडून (DISCOM) उत्तराची वाट पाहत आहोत',
};

export const MARATHI_WORDS: LanguageWords = {
  messages: {
    quotation_sent: (p) => ({
      title: 'तुमचे कोटेशन तयार आहे',
      body: `${p.number}: ${p.total}. सबसिडीनंतर तुम्हाला ${p.effective} भरायचे आहेत.`,
    }),
    project_started: (p) => ({
      title: 'तुमचा सोलर प्रकल्प सुरू झाला',
      body: `${p.project}: ${p.capacity} ची सिस्टिम.`,
    }),
    project_milestone: (p) => ({
      title: p.milestone ?? 'प्रकल्पाची नवी माहिती',
      body: p.project ?? '',
    }),
    project_manager_changed: (p) => ({
      title: 'तुमचे नवीन प्रोजेक्ट मॅनेजर',
      body: `${p.project}: आता ${p.manager} तुमचा प्रोजेक्ट पाहतील. फोन: ${p.phone}.`,
    }),
    payment_received: (p) => ({
      title: 'पेमेंट मिळाले',
      body: `${p.amount} मिळाले — ${p.milestone}. धन्यवाद!`,
    }),
    payment_link: (p) => ({
      title: 'ऑनलाइन पेमेंट करा',
      body: `${p.amount} — ${p.milestone}, ${p.project}. UPI किंवा कार्डने भरण्यासाठी ‘पेमेंट’ उघडा.`,
    }),
    payment_reminder: (p) => ({
      title: 'पेमेंट बाकी आहे',
      body: `${p.amount} — ${p.milestone}, ${p.project}.`,
    }),
    service_update: (p) => ({
      title: 'तुमच्या सर्व्हिस विनंतीची माहिती',
      body: `${p.topic}: ${p.status}.`,
    }),
    contact_changed: (p) => ({
      title: 'तुमचा OneOhm संपर्क बदलला आहे',
      body: `${p.staff} आता ${p.subject} साठी तुमचे संपर्क आहेत. ${p.phone} वर फोन करा.`,
    }),
    change_request_raised: (p) => ({
      title: 'बदलाची विनंती सुरू झाली',
      body: `${p.request}, क्रमांक ${p.number}.`,
    }),
    change_request_completed: (p) => ({
      title: 'बदलाची विनंती पूर्ण झाली',
      body: `${p.request}, क्रमांक ${p.number}.`,
    }),
    document_requested: (p) => ({
      title: `कृपया ${p.document} पाठवा`,
      body: `${p.project ? `${p.project}: ` : ''}‘कागदपत्रे’ उघडा आणि फोटो किंवा PDF पाठवा.`,
    }),
    paper_request: (p) => ({
      title: `कृपया ${p.document} पाठवा`,
      body: `${p.home} येथील तुमच्या सोलरसाठी. OneOhm ॲपमधून पाठवा, किंवा आमच्या टीमकडे द्या.`,
    }),
    paper_again: (p) => ({
      title: `कृपया तुमचे ${p.document} पुन्हा पाठवा`,
      body: p.reason ?? '',
    }),
    paper_checked: (p) => ({
      title: `तुमचे ${p.document} तपासले ✅`,
      body: 'धन्यवाद.',
    }),
    paper_stale: (p) => ({
      title: `${p.home} साठी आम्हाला तुमचे ताजे ${p.document} हवे आहे`,
      body: `आमच्याकडे असलेले ${p.month} चे आहे.`,
    }),
    document_request_cancelled: (p) => ({
      title: `${p.document} आता लागणार नाही`,
      body: 'तुम्हाला ते पाठवण्याची गरज नाही.',
    }),
    document_received_by_team: (p) => ({
      title: `तुमचे ${p.document} आम्हाला मिळाले`,
      body: `${p.home} येथील तुमच्या सोलरसाठी. धन्यवाद.`,
    }),
    maintenance_visit: (p) => ({
      title: `मोफत ${p.visit} भेट: ${p.date}`,
      body: `${p.project}: येण्याआधी आमची सर्व्हिस टीम तुम्हाला फोन करेल.`,
    }),
    survey_scheduled: (p) => ({
      title: `साइट सर्व्हे: ${p.date}`,
      body: `${p.project}: येण्याआधी आमची टीम तुम्हाला फोन करेल.`,
    }),
    stage_rating_request: (p) => ({
      title: 'आमचे काम कसे वाटले?',
      body: `${p.project}: ${MR_STAGES[p.stageKey ?? ''] ?? p.stage} पूर्ण झाले. कृपया ॲपमध्ये रेटिंग द्या.`,
    }),
    installation_started: (p) => ({
      title: 'बसवण्याचे काम सुरू झाले',
      body: `${p.project}: आमची टीम तुमची ${p.capacity} सिस्टिम बसवत आहे.`,
    }),
    commissioning_completed: (p) => ({
      title: 'तुमची सिस्टिम सुरू झाली',
      body: `${p.project}: आता शेवटचे पेमेंट बाकी आहे. ‘पेमेंट’ उघडून पाहा.`,
    }),
    project_update_link: (p) => ({
      title: p.milestone ?? 'प्रकल्पाची नवी माहिती',
      body: `${p.project}: कागद ‘कागदपत्रे’ मध्ये आहे.`,
    }),
    service_visit_booked: (p) => ({
      title: `तंत्रज्ञाची भेट: ${p.date}`,
      body: `${p.topic}: येण्याआधी तंत्रज्ञ तुम्हाला फोन करतील.`,
    }),
    project_waiting: (p) => ({
      title: MR_WAITING[p.party ?? ''] ?? 'थोडा उशीर होत आहे',
      body: `${p.project}: ${p.milestone}. पुढची माहिती आम्ही कळवू.`,
    }),
    referral_reward: (p) => ({
      title: 'रेफरल बक्षिसाची माहिती',
      body: `${p.friend}: ${p.amount} — ${p.status}.`,
    }),
  },
  steps: {
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
  },
  payments: {
    advance: 'ऑर्डर पक्की झाल्यावर ॲडव्हान्स',
    before_dispatch: 'पॅनल आणि इन्व्हर्टर पाठवण्याआधी',
    final: 'बसवून सिस्टिम सुरू झाल्यावर',
    bank_disbursement: 'बँकेच्या कर्जाची रक्कम',
  },
  categories: {
    no_generation: 'सोलरमधून वीज येत नाही',
    low_generation: 'नेहमीपेक्षा कमी वीज',
    inverter_error: 'इन्व्हर्टरवर एरर किंवा अलार्म',
    physical_damage: 'पॅनल किंवा वायरिंगचे नुकसान',
    cleaning: 'पॅनलची साफसफाई',
    billing_net_meter: 'वीज बिल किंवा नेट मीटर',
    subsidy: 'सबसिडीबद्दल प्रश्न',
    other: 'इतर काही',
    maintenance_visit: 'देखभाल भेट',
  },
  service: { open: 'विनंती मिळाली', in_progress: 'काम सुरू आहे', resolved: 'काम पूर्ण झाले' },
  reward: {
    pending: 'मिळाले, मंजुरीची वाट पाहत आहोत',
    approved: 'मंजूर झाले, लवकरच मिळेल',
    paid: 'तुम्हाला दिले',
    rejected: 'मंजूर झाले नाही',
  },
  contactSubjects: {
    project: 'तुमच्या सोलर प्रोजेक्ट',
    service: 'तुमच्या सर्व्हिस विनंती',
    enquiry: 'तुमच्या सोलर चौकशी',
  },
  someHome: 'तुमच्या घरी',
  alerts: { stage_rating_reply: 'आम्ही तुमच्या अभिप्रायाला उत्तर दिले' },
};
