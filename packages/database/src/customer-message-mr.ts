/**
 * Marathi words for the customer's in-app alerts (PRD 5.1).
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { LanguageWords } from './customer-message-words';

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
      body: `${p.project}: ‘कागदपत्रे’ उघडा आणि फोटो किंवा PDF पाठवा.`,
    }),
    maintenance_visit: (p) => ({
      title: `मोफत ${p.visit} भेट: ${p.date}`,
      body: `${p.project}: येण्याआधी आमची सर्व्हिस टीम तुम्हाला फोन करेल.`,
    }),
    referral_reward: (p) => ({
      title: 'रेफरल बक्षिसाची माहिती',
      body: `${p.friend}: ${p.amount} — ${p.status}.`,
    }),
  },
  steps: {
    site_survey: 'साईट भेट आणि छताचे मोजमाप',
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
  alerts: { stage_rating_reply: 'OneOhm ने तुमच्या अभिप्रायाला उत्तर दिले' },
};
