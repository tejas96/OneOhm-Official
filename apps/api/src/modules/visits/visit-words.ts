import { VISIT_PHRASES, type VisitKind } from '@oneohm/domain';
import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * What the customer reads about a visit (redesign §8), in the "we" voice, in English, Marathi and
 * Hindi. Buttons keep 20 characters, list rows 24, a row's line 72 (visit-words.test.ts checks).
 */
const EN_VISIT = {
  buttons: {
    pick: 'Pick a day',
    morning: 'Morning',
    afternoon: 'Afternoon',
    okay: 'Okay',
    change: 'Change day',
    confirm: 'Confirm',
    there: "I'll be there",
  },
  ...VISIT_PHRASES.en,
  pick: {
    ask: (home: string, work: string) => `When can our team visit *${home}* for the *${work}*?`,
    again: (home: string, work: string) =>
      `No problem. When can our team visit *${home}* for the *${work}*?`,
    amc: (home: string) => `Your free AMC visit for *${home}* is due. Pick a day:`,
    homeLine: (home: string | null) =>
      `Please pick a day for our visit${home ? ` to your ${home} home` : ''}.`,
    list: 'Pick a day',
    section: 'Days we are free',
    rowLine: 'Our team can come this day',
    talk: (name: string) => `Talk to ${name}`,
    talkLine: 'Tell us what suits you',
    none: (name: string) =>
      `We have no free day to show right now. ${name} will call you to fix a day.`,
    slot: (day: string) => `*${day}* — morning or afternoon?`,
    thanks: (by: string) => `Thanks — we'll confirm by *${by}*.`,
    by: { today: '6:30 pm today', tomorrow: 'tomorrow 12 noon', monday: 'Monday 12 noon' },
    taken: 'That time was just taken. Please pick again.',
    team: 'our team',
  },
  booked: (when: string, name: string, phone: string) =>
    `Booked ✅ *${when}*. ${name} will call before coming${phone ? ` (${phone})` : ''}.`,
  changed: (when: string, name: string, phone: string) =>
    `We have moved your visit to *${when}*. ${name} will call before coming${phone ? ` (${phone})` : ''}.`,
  cancelled: (work: string, home: string) =>
    `Your visit for the *${work}* at ${home} is cancelled. We will tell you the new day.`,
  reminder: (home: string, when: string, work: string) =>
    `Our team visits *${home}* ${when} for the *${work}*.`,
  presence: (work: string, home: string, day: string) =>
    `The electricity board (DISCOM) will do the *${work}* at *${home}* on *${day}*. Please be at home.`,
  thanks: {
    okay: 'Thank you ✅',
    confirmed: 'Thank you ✅ We will see you then.',
    there: 'Thank you ✅ We have noted you will be there.',
    cannot: (name: string) => `Thanks — ${name} will call you about a new day.`,
  },
  old: 'That was an earlier message — we have noted what you sent.',
};

const MR_VISIT: Words<typeof EN_VISIT> = {
  buttons: {
    pick: 'दिवस निवडा',
    morning: 'सकाळी',
    afternoon: 'दुपारी',
    okay: 'ठीक आहे',
    change: 'दिवस बदला',
    confirm: 'पक्के करा',
    there: 'मी असेन',
  },
  ...VISIT_PHRASES.mr,
  pick: {
    ask: (home, work) => `आमची टीम *${home}* येथे *${work}* साठी कधी येऊ शकते?`,
    again: (home, work) => `ठीक आहे. आमची टीम *${home}* येथे *${work}* साठी कधी येऊ शकते?`,
    amc: (home) => `*${home}* साठी तुमची मोफत AMC भेट आता देय आहे. दिवस निवडा:`,
    homeLine: (home) => `कृपया आमच्या भेटीसाठी${home ? ` तुमच्या ${home} घरी` : ''} दिवस निवडा.`,
    list: 'दिवस निवडा',
    section: 'आम्ही मोकळे असलेले दिवस',
    rowLine: 'आमची टीम या दिवशी येऊ शकते',
    talk: (name) => `${name} शी बोला`,
    talkLine: 'तुम्हाला कोणता दिवस सोयीचा ते सांगा',
    none: (name) => `सध्या दाखवण्यासारखा मोकळा दिवस नाही. ${name} तुम्हाला फोन करून दिवस ठरवतील.`,
    slot: (day) => `*${day}* — सकाळी की दुपारी?`,
    thanks: (by) => `धन्यवाद — आम्ही *${by}* पर्यंत पक्के करू.`,
    by: { today: 'आज संध्याकाळी ६:३०', tomorrow: 'उद्या दुपारी १२', monday: 'सोमवारी दुपारी १२' },
    taken: 'ती वेळ आत्ताच घेतली गेली. कृपया पुन्हा निवडा.',
    team: 'आमची टीम',
  },
  booked: (when, name, phone) =>
    `ठरले ✅ *${when}*. येण्यापूर्वी ${name} तुम्हाला फोन करतील${phone ? ` (${phone})` : ''}.`,
  changed: (when, name, phone) =>
    `आम्ही तुमची भेट *${when}* ला हलवली आहे. येण्यापूर्वी ${name} तुम्हाला फोन करतील${phone ? ` (${phone})` : ''}.`,
  cancelled: (work, home) => `${home} येथील *${work}* ची तुमची भेट रद्द झाली आहे. नवा दिवस आम्ही कळवू.`,
  reminder: (home, when, work) => `आमची टीम *${home}* येथे ${when} *${work}* साठी येणार आहे.`,
  presence: (work, home, day) =>
    `वीज मंडळ (DISCOM) *${home}* येथे *${day}* रोजी *${work}* करणार आहे. कृपया घरी राहा.`,
  thanks: {
    okay: 'धन्यवाद ✅',
    confirmed: 'धन्यवाद ✅ भेटू या.',
    there: 'धन्यवाद ✅ तुम्ही असाल हे आम्ही नोंदवले आहे.',
    cannot: (name) => `धन्यवाद — नवा दिवस ठरवण्यासाठी ${name} तुम्हाला फोन करतील.`,
  },
  old: 'तो आधीचा मेसेज होता — तुम्ही पाठवलेले आम्ही नोंदवले आहे.',
};

const HI_VISIT: Words<typeof EN_VISIT> = {
  buttons: {
    pick: 'दिन चुनें',
    morning: 'सुबह',
    afternoon: 'दोपहर',
    okay: 'ठीक है',
    change: 'दिन बदलें',
    confirm: 'पक्का करें',
    there: 'मैं रहूँगा',
  },
  ...VISIT_PHRASES.hi,
  pick: {
    ask: (home, work) => `हमारी टीम *${home}* पर *${work}* के लिए कब आ सकती है?`,
    again: (home, work) => `ठीक है। हमारी टीम *${home}* पर *${work}* के लिए कब आ सकती है?`,
    amc: (home) => `*${home}* के लिए आपकी मुफ़्त AMC विज़िट का समय हो गया है। दिन चुनें:`,
    homeLine: (home) => `कृपया हमारी विज़िट${home ? ` आपके ${home} घर पर` : ''} के लिए दिन चुनें।`,
    list: 'दिन चुनें',
    section: 'हमारे खाली दिन',
    rowLine: 'हमारी टीम इस दिन आ सकती है',
    talk: (name) => `${name} से बात करें`,
    talkLine: 'बताइए आपको कौन सा दिन ठीक है',
    none: (name) => `अभी दिखाने लायक कोई खाली दिन नहीं है। ${name} आपको फ़ोन करके दिन तय करेंगे।`,
    slot: (day) => `*${day}* — सुबह या दोपहर?`,
    thanks: (by) => `धन्यवाद — हम *${by}* तक पक्का करेंगे।`,
    by: { today: 'आज शाम 6:30', tomorrow: 'कल दोपहर 12', monday: 'सोमवार दोपहर 12' },
    taken: 'वह समय अभी ले लिया गया। कृपया दोबारा चुनें।',
    team: 'हमारी टीम',
  },
  booked: (when, name, phone) =>
    `तय हो गया ✅ *${when}*। आने से पहले ${name} आपको फ़ोन करेंगे${phone ? ` (${phone})` : ''}।`,
  changed: (when, name, phone) =>
    `हमने आपकी विज़िट *${when}* कर दी है। आने से पहले ${name} आपको फ़ोन करेंगे${phone ? ` (${phone})` : ''}।`,
  cancelled: (work, home) => `${home} पर *${work}* की आपकी विज़िट रद्द हो गई है। नया दिन हम बताएँगे।`,
  reminder: (home, when, work) => `हमारी टीम *${home}* पर ${when} *${work}* के लिए आ रही है।`,
  presence: (work, home, day) =>
    `बिजली बोर्ड (DISCOM) *${home}* पर *${day}* को *${work}* करेगा। कृपया घर पर रहें।`,
  thanks: {
    okay: 'धन्यवाद ✅',
    confirmed: 'धन्यवाद ✅ मिलते हैं।',
    there: 'धन्यवाद ✅ हमने नोट कर लिया कि आप रहेंगे।',
    cannot: (name) => `धन्यवाद — नया दिन तय करने के लिए ${name} आपको फ़ोन करेंगे।`,
  },
  old: 'वह पहले का संदेश था — आपने जो भेजा, हमने नोट कर लिया है।',
};

export const VISIT_LISTS = { en: EN_VISIT, mr: MR_VISIT, hi: HI_VISIT };
export const VISIT_WORDS = localized(EN_VISIT, { mr: MR_VISIT, hi: HI_VISIT });

/** The customer's words for the work of a visit. */
export const workWords = (kind: VisitKind): string => VISIT_WORDS.work[kind];
