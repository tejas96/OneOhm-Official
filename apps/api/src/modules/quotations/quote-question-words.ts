import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * The questions a customer can ask about their quote, and the fixed answers built from the quote's own
 * data (redesign §9). List rows keep 24 characters, the list button 20; answers end with
 * [Accept quote] [I have a question].
 */
export const QUOTE_TOPICS = [
  'subsidy',
  'plan',
  'panels',
  'warranty',
  'timeline',
  'call',
  'other',
] as const;
export type QuoteTopic = (typeof QUOTE_TOPICS)[number];

const EN = {
  ask: 'What would you like to know about your quote?',
  button: 'Pick a question',
  topics: {
    subsidy: 'Subsidy',
    plan: 'Payment plan',
    panels: 'Panels & brand',
    warranty: 'Warranty',
    timeline: 'Timeline',
    call: 'Call me',
    other: 'Something else',
  } as Record<QuoteTopic, string>,
  subsidy: (subsidy: string, effective: string) =>
    `Your subsidy is ${subsidy}. It comes back to your bank account after your system is switched on and the government approves it. After the subsidy your cost is ${effective}.`,
  noSubsidy: (why: string) => `This quote has no subsidy${why ? ` (${why})` : ''}.`,
  panels: (count: number, kw: string, panel: string, inverter: string) =>
    `Your system is ${kw}: ${count} panels (${panel}). Inverter: ${inverter}.`,
  warranty: (panel: number, perf: number | null, inverter: number, work: number) =>
    `Warranty: panels ${panel} years${perf ? ` (power output ${perf} years)` : ''}, inverter ${inverter} years, our workmanship ${work} ${work === 1 ? 'year' : 'years'}.`,
  timeline: (until: string, first: string, when: string) =>
    `This quote is valid until ${until}. After you accept, the 1st instalment, ${first}, is due ${when}. Then we plan a site visit and tell you each date here.`,
  called: (name: string, when: string) => `*${name}* will call you ${when}.`,
  checkBack: 'When should we check back?',
  week: '1 week',
  month: '1 month',
  checkBackSet: (when: string) =>
    `Okay, we will check back in ${when}. Your quote stays safe with us.`,
  old: 'This quote has changed or is no longer open.',
  changed: (note: string) => `*What changed:* ${note}`,
};

const MR: Words<typeof EN> = {
  ask: 'तुमच्या कोटेशनबद्दल काय जाणून घ्यायचे आहे?',
  button: 'प्रश्न निवडा',
  topics: {
    subsidy: 'सबसिडी',
    plan: 'पेमेंट प्लॅन',
    panels: 'पॅनल आणि ब्रँड',
    warranty: 'वॉरंटी',
    timeline: 'वेळापत्रक',
    call: 'मला फोन करा',
    other: 'दुसरे काही',
  },
  subsidy: (subsidy, effective) =>
    `तुमची सबसिडी ${subsidy} आहे. सिस्टिम सुरू झाल्यावर आणि सरकारची मंजुरी मिळाल्यावर ती तुमच्या बँक खात्यात परत येते. सबसिडीनंतर तुमचा खर्च ${effective}.`,
  noSubsidy: (why) => `या कोटेशनमध्ये सबसिडी नाही${why ? ` (${why})` : ''}.`,
  panels: (count, kw, panel, inverter) =>
    `तुमची सिस्टिम ${kw} ची आहे: ${count} पॅनल (${panel}). इन्व्हर्टर: ${inverter}.`,
  warranty: (panel, perf, inverter, work) =>
    `वॉरंटी: पॅनल ${panel} वर्षे${perf ? ` (पॉवर आउटपुट ${perf} वर्षे)` : ''}, इन्व्हर्टर ${inverter} वर्षे, आमचे काम ${work} वर्ष.`,
  timeline: (until, first, when) =>
    `हे कोटेशन ${until} पर्यंत वैध आहे. स्वीकारल्यावर पहिला हप्ता ${first} ${when} भरायचा आहे. मग आम्ही साइट भेट ठरवू आणि प्रत्येक तारीख इथे कळवू.`,
  called: (name, when) => `*${name}* तुम्हाला ${when} फोन करतील.`,
  checkBack: 'आम्ही कधी पुन्हा विचारू?',
  week: '१ आठवडा',
  month: '१ महिना',
  checkBackSet: (when) => `ठीक आहे, आम्ही ${when} नंतर पुन्हा विचारू. तुमचे कोटेशन आमच्याकडे सुरक्षित आहे.`,
  old: 'हे कोटेशन बदलले आहे किंवा आता खुले नाही.',
  changed: (note) => `*काय बदलले:* ${note}`,
};

const HI: Words<typeof EN> = {
  ask: 'आपको अपने कोटेशन के बारे में क्या जानना है?',
  button: 'सवाल चुनें',
  topics: {
    subsidy: 'सब्सिडी',
    plan: 'पेमेंट प्लान',
    panels: 'पैनल और ब्रांड',
    warranty: 'वारंटी',
    timeline: 'समय-सारणी',
    call: 'मुझे फ़ोन करें',
    other: 'कुछ और',
  },
  subsidy: (subsidy, effective) =>
    `आपकी सब्सिडी ${subsidy} है। सिस्टम चालू होने और सरकारी मंज़ूरी के बाद यह आपके बैंक खाते में वापस आती है। सब्सिडी के बाद आपकी लागत ${effective} है।`,
  noSubsidy: (why) => `इस कोटेशन में सब्सिडी नहीं है${why ? ` (${why})` : ''}।`,
  panels: (count, kw, panel, inverter) =>
    `आपका सिस्टम ${kw} का है: ${count} पैनल (${panel})। इन्वर्टर: ${inverter}।`,
  warranty: (panel, perf, inverter, work) =>
    `वारंटी: पैनल ${panel} साल${perf ? ` (पावर आउटपुट ${perf} साल)` : ''}, इन्वर्टर ${inverter} साल, हमारा काम ${work} साल।`,
  timeline: (until, first, when) =>
    `यह कोटेशन ${until} तक मान्य है। स्वीकार करने के बाद पहली किस्त ${first} ${when} देनी है। फिर हम साइट विज़िट तय करेंगे और हर तारीख यहीं बताएँगे।`,
  called: (name, when) => `*${name}* आपको ${when} फ़ोन करेंगे।`,
  checkBack: 'हम कब दोबारा पूछें?',
  week: '1 हफ़्ता',
  month: '1 महीना',
  checkBackSet: (when) => `ठीक है, हम ${when} बाद दोबारा पूछेंगे। आपका कोटेशन हमारे पास सुरक्षित है।`,
  old: 'यह कोटेशन बदल गया है या अब खुला नहीं है।',
  changed: (note) => `*क्या बदला:* ${note}`,
};

export const QUOTE_QUESTION_LISTS = { en: EN, mr: MR, hi: HI };
export const QUOTE_Q_WORDS = localized(EN, { mr: MR, hi: HI });
