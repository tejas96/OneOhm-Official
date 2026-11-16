import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * What the customer reads in the chat about a site visit (Duty Day step 6), in the "we" voice,
 * in English, Marathi and Hindi. Buttons keep 20 characters (visit-news-words.test.ts checks).
 * Outside the chat window the approved templates say the same (send-template-words-duty.ts).
 */
const EN = {
  onWay: (worker: string, home: string, minutes: number) =>
    `*${worker}* from OneOhm is on the way to *${home}*. Expected in about *${minutes} min*.`,
  track: 'Track live',
  arrived: (worker: string, home: string) => `*${worker}* from OneOhm has reached *${home}*.`,
  check: (worker: string, home: string) =>
    `*${worker}* from OneOhm visited *${home}* today. Was this visit done?`,
  yes: 'Yes, visited',
  no: 'No',
  thanks: 'Thank you for telling us ✅',
  sorry: 'Sorry about this. We will call you soon.',
  already: 'Thank you, we already have your answer for this visit.',
  unknown: 'Sorry, we could not find this visit.',
};

const MR: Words<typeof EN> = {
  onWay: (worker, home, minutes) =>
    `OneOhm चे *${worker}* *${home}* येथे येण्यासाठी निघाले आहेत. सुमारे *${minutes} मिनिटांत* पोहोचतील.`,
  track: 'लाइव्ह पाहा',
  arrived: (worker, home) => `OneOhm चे *${worker}* *${home}* येथे पोहोचले आहेत.`,
  check: (worker, home) => `OneOhm चे *${worker}* आज *${home}* येथे आले होते. ही भेट झाली का?`,
  yes: 'हो, आले होते',
  no: 'नाही',
  thanks: 'कळवल्याबद्दल धन्यवाद ✅',
  sorry: 'याबद्दल क्षमस्व. आम्ही लवकरच तुम्हाला फोन करू.',
  already: 'धन्यवाद, या भेटीबद्दल तुमचे उत्तर आम्हाला आधीच मिळाले आहे.',
  unknown: 'क्षमस्व, ही भेट आम्हाला सापडली नाही.',
};

const HI: Words<typeof EN> = {
  onWay: (worker, home, minutes) =>
    `OneOhm से *${worker}* *${home}* के लिए निकल चुके हैं। लगभग *${minutes} मिनट* में पहुँचेंगे।`,
  track: 'लाइव देखें',
  arrived: (worker, home) => `OneOhm से *${worker}* *${home}* पर पहुँच गए हैं।`,
  check: (worker, home) => `OneOhm से *${worker}* आज *${home}* पर आए थे। क्या यह विज़िट हुई?`,
  yes: 'हाँ, आए थे',
  no: 'नहीं',
  thanks: 'बताने के लिए धन्यवाद ✅',
  sorry: 'इसके लिए माफ़ी। हम जल्द ही आपको फ़ोन करेंगे।',
  already: 'धन्यवाद, इस विज़िट के लिए आपका जवाब हमें पहले ही मिल गया है।',
  unknown: 'माफ़ कीजिए, यह विज़िट हमें नहीं मिली।',
};

export const VISIT_NEWS_LISTS = { en: EN, mr: MR, hi: HI };
export const VISIT_NEWS_WORDS = localized(EN, { mr: MR, hi: HI });
