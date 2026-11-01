/**
 * Hindi words for the customer's in-app alerts (PRD 5.1).
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { LanguageWords } from './customer-message-words';

const HI_STAGES: Readonly<Record<string, string>> = {
  survey: 'साइट सर्वे',
  installation: 'इंस्टॉलेशन',
  commissioning: 'सिस्टम चालू करना और हैंडओवर',
};

/** Who a delayed step waits on, by the party key in the message. */
const HI_WAITING: Readonly<Record<string, string>> = {
  customer: 'आपसे कोई कागज़ या जवाब चाहिए',
  bank: 'बैंक के जवाब का इंतज़ार है',
  discom: 'बिजली विभाग (DISCOM) के जवाब का इंतज़ार है',
};

export const HINDI_WORDS: LanguageWords = {
  messages: {
    quotation_sent: (p) => ({
      title: 'आपका कोटेशन तैयार है',
      body: `${p.number}: ${p.total}। सब्सिडी के बाद आपको ${p.effective} देने हैं।`,
    }),
    project_started: (p) => ({
      title: 'आपका सोलर प्रोजेक्ट शुरू हो गया',
      body: `${p.project}: ${p.capacity} का सिस्टम।`,
    }),
    project_milestone: (p) => ({
      title: p.milestone ?? 'प्रोजेक्ट की नई जानकारी',
      body: p.project ?? '',
    }),
    payment_received: (p) => ({
      title: 'पेमेंट मिल गया',
      body: `${p.amount} मिल गए — ${p.milestone}। धन्यवाद!`,
    }),
    payment_link: (p) => ({
      title: 'ऑनलाइन पेमेंट करें',
      body: `${p.amount} — ${p.milestone}, ${p.project}। UPI या कार्ड से भरने के लिए ‘पेमेंट’ खोलें।`,
    }),
    payment_reminder: (p) => ({
      title: 'पेमेंट बाकी है',
      body: `${p.amount} — ${p.milestone}, ${p.project}।`,
    }),
    service_update: (p) => ({
      title: 'आपकी सर्विस रिक्वेस्ट की जानकारी',
      body: `${p.topic}: ${p.status}।`,
    }),
    change_request_raised: (p) => ({
      title: 'बदलाव की रिक्वेस्ट शुरू हुई',
      body: `${p.request}, नंबर ${p.number}।`,
    }),
    change_request_completed: (p) => ({
      title: 'बदलाव की रिक्वेस्ट पूरी हुई',
      body: `${p.request}, नंबर ${p.number}।`,
    }),
    document_requested: (p) => ({
      title: `कृपया ${p.document} भेजें`,
      body: `${p.project}: ‘दस्तावेज़’ खोलें और फ़ोटो या PDF भेजें।`,
    }),
    maintenance_visit: (p) => ({
      title: `मुफ़्त ${p.visit} विज़िट: ${p.date}`,
      body: `${p.project}: आने से पहले हमारी सर्विस टीम आपको फ़ोन करेगी।`,
    }),
    survey_scheduled: (p) => ({
      title: `साइट सर्वे: ${p.date}`,
      body: `${p.project}: आने से पहले हमारी टीम आपको फ़ोन करेगी।`,
    }),
    stage_rating_request: (p) => ({
      title: 'हमारा काम कैसा लगा?',
      body: `${p.project}: ${HI_STAGES[p.stageKey ?? ''] ?? p.stage} पूरा हुआ। कृपया ऐप में रेटिंग दें।`,
    }),
    installation_started: (p) => ({
      title: 'लगाने का काम शुरू हो गया',
      body: `${p.project}: हमारी टीम आपका ${p.capacity} सिस्टम लगा रही है।`,
    }),
    commissioning_completed: (p) => ({
      title: 'आपका सिस्टम चालू हो गया',
      body: `${p.project}: अब आखिरी पेमेंट बाकी है। ‘पेमेंट’ खोलकर देखें।`,
    }),
    project_update_link: (p) => ({
      title: p.milestone ?? 'प्रोजेक्ट की नई जानकारी',
      body: `${p.project}: कागज़ ‘दस्तावेज़’ में है।`,
    }),
    service_visit_booked: (p) => ({
      title: `टेक्नीशियन की विज़िट: ${p.date}`,
      body: `${p.topic}: आने से पहले टेक्नीशियन आपको फ़ोन करेंगे।`,
    }),
    project_waiting: (p) => ({
      title: HI_WAITING[p.party ?? ''] ?? 'थोड़ी देर हो रही है',
      body: `${p.project}: ${p.milestone}। आगे की जानकारी हम देंगे।`,
    }),
    referral_reward: (p) => ({
      title: 'रेफ़रल इनाम की जानकारी',
      body: `${p.friend}: ${p.amount} — ${p.status}।`,
    }),
  },
  steps: {
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
  },
  payments: {
    advance: 'ऑर्डर पक्का होने पर एडवांस',
    before_dispatch: 'पैनल और इन्वर्टर भेजने से पहले',
    final: 'फ़िटिंग और सिस्टम चालू होने के बाद',
    bank_disbursement: 'बैंक लोन की रकम',
  },
  categories: {
    no_generation: 'सोलर से बिजली नहीं बन रही',
    low_generation: 'रोज़ से कम बिजली',
    inverter_error: 'इन्वर्टर में एरर या अलार्म',
    physical_damage: 'पैनल या वायरिंग में नुकसान',
    cleaning: 'पैनल की सफ़ाई',
    billing_net_meter: 'बिजली बिल या नेट मीटर',
    subsidy: 'सब्सिडी के बारे में सवाल',
    other: 'कुछ और',
    maintenance_visit: 'मेंटेनेंस विज़िट',
  },
  service: { open: 'रिक्वेस्ट मिल गई', in_progress: 'काम चल रहा है', resolved: 'काम पूरा हो गया' },
  reward: {
    pending: 'मिल गया, मंज़ूरी का इंतज़ार है',
    approved: 'मंज़ूर हो गया, जल्द मिलेगा',
    paid: 'आपको दे दिया गया',
    rejected: 'मंज़ूर नहीं हुआ',
  },
  alerts: { stage_rating_reply: 'OneOhm ने आपकी राय का जवाब दिया' },
};
