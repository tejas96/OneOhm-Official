import { localized, type Words } from '../whatsapp/assistant/language';
import type { ProblemKind, Since } from './care-taps';

/**
 * The problem report in the customer's words (redesign §12): what is wrong, since when, the add-on step,
 * the reply that names who will call, the "Fixed ✅" check and the reopen. Buttons keep 20 characters, list
 * rows 24, row descriptions 72.
 */
const EN = {
  askWhat: 'What is wrong? Tap the nearest one.',
  pick: 'Pick one',
  what: {
    inverter: 'Inverter error',
    nopower: 'No power',
    lowpower: 'Low power',
    damage: 'Damage',
    cleaning: 'Cleaning',
    bill: 'Bill or meter',
    other: 'Something else',
  } as Record<ProblemKind, string>,
  askSince: 'Since when?',
  since: { today: 'Today', week: 'This week', longer: 'Longer' } as Record<Since, string>,
  /** The words put in the problem for "since": the team reads them. */
  sinceNote: {
    today: 'since today',
    week: 'since this week',
    longer: 'for longer than a week',
  } as Record<Since, string>,
  addOn: 'Send up to 3 photos or a few words if you like, then tap Done.',
  done: 'Done',
  saved: (what: string, home: string | null, name: string, when: string) =>
    `Thank you ✅ Noted: *${what}${home ? ` · ${home}` : ''}*. *${name}* will call you ${when}.`,
  team: 'Our service team',
  voiceAdded: (name: string) =>
    `Thank you, your voice note is added to your problem. ${name} will listen to it.`,
  formBody: 'Tell us what is wrong. It takes a minute.',
  formButton: 'Report a problem',
  fixed: (topic: string) => `Fixed ✅ Is it working now?\n${topic}`,
  yes: 'Yes, working',
  still: 'Still a problem',
  reopened: (name: string, when: string) =>
    `Sorry about that. We have opened your problem again. *${name}* will call you ${when}.`,
  fixedOld: 'Thank you, we have noted it.',
  homeFixed: (topic: string) => `Is it working now? ${topic}`,
  answerNow: 'Answer now',
  fixedWhat: 'the check on your problem',
  fixedCancelled: 'You do not need to tell us whether it is working any more. Thank you.',
  none: 'You have no problem open right now.',
};

const MR: Words<typeof EN> = {
  askWhat: 'काय अडचण आहे? सर्वात जवळचा पर्याय दाबा.',
  pick: 'निवडा',
  what: {
    inverter: 'इन्व्हर्टर एरर',
    nopower: 'वीज निर्मिती बंद',
    lowpower: 'वीज कमी येते',
    damage: 'नुकसान',
    cleaning: 'सफाई',
    bill: 'बिल किंवा मीटर',
    other: 'इतर काही',
  },
  askSince: 'किती दिवसांपासून?',
  since: { today: 'आजपासून', week: 'या आठवड्यापासून', longer: 'जास्त दिवसांपासून' },
  sinceNote: { today: 'आजपासून', week: 'या आठवड्यापासून', longer: 'आठवड्यापेक्षा जास्त काळ' },
  addOn: 'हवे असल्यास ३ पर्यंत फोटो किंवा थोडे शब्द पाठवा, मग पूर्ण झाले दाबा.',
  done: 'पूर्ण झाले',
  saved: (what, home, name, when) =>
    `धन्यवाद ✅ नोंद केली: *${what}${home ? ` · ${home}` : ''}*. *${name}* तुम्हाला ${when} फोन करतील.`,
  team: 'आमची सर्व्हिस टीम',
  voiceAdded: (name) => `धन्यवाद, तुमची व्हॉइस नोट तुमच्या अडचणीला जोडली आहे. ${name} ती ऐकतील.`,
  formBody: 'काय अडचण आहे ते सांगा. एक मिनिट लागतो.',
  formButton: 'अडचण सांगा',
  fixed: (topic) => `दुरुस्त केले ✅ आता ते नीट चालते का?\n${topic}`,
  yes: 'हो, चालू आहे',
  still: 'अजून अडचण आहे',
  reopened: (name, when) =>
    `क्षमस्व. आम्ही तुमची अडचण पुन्हा उघडली आहे. *${name}* तुम्हाला ${when} फोन करतील.`,
  fixedOld: 'धन्यवाद, आम्ही नोंद केली आहे.',
  homeFixed: (topic) => `आता ते नीट चालते का? ${topic}`,
  answerNow: 'आता सांगा',
  fixedWhat: 'अडचणीबद्दलची तपासणी',
  fixedCancelled: 'ते नीट चालते का हे सांगण्याची आता गरज नाही. धन्यवाद.',
  none: 'सध्या तुमची कोणतीही अडचण उघडी नाही.',
};

const HI: Words<typeof EN> = {
  askWhat: 'क्या समस्या है? सबसे पास वाला विकल्प दबाएँ।',
  pick: 'चुनें',
  what: {
    inverter: 'इन्वर्टर एरर',
    nopower: 'बिजली नहीं बन रही',
    lowpower: 'बिजली कम बन रही',
    damage: 'नुकसान',
    cleaning: 'सफ़ाई',
    bill: 'बिल या मीटर',
    other: 'कुछ और',
  },
  askSince: 'कब से?',
  since: { today: 'आज से', week: 'इस हफ़्ते से', longer: 'ज़्यादा दिनों से' },
  sinceNote: { today: 'आज से', week: 'इस हफ़्ते से', longer: 'एक हफ़्ते से ज़्यादा समय से' },
  addOn: 'चाहें तो 3 तक फ़ोटो या कुछ शब्द भेजें, फिर पूरा हुआ दबाएँ।',
  done: 'पूरा हुआ',
  saved: (what, home, name, when) =>
    `धन्यवाद ✅ दर्ज किया: *${what}${home ? ` · ${home}` : ''}*. *${name}* आपको ${when} फ़ोन करेंगे।`,
  team: 'हमारी सर्विस टीम',
  voiceAdded: (name) => `धन्यवाद, आपका वॉइस नोट आपकी समस्या में जोड़ दिया गया है। ${name} उसे सुनेंगे।`,
  formBody: 'बताएँ क्या समस्या है। एक मिनट लगता है।',
  formButton: 'समस्या बताएँ',
  fixed: (topic) => `ठीक किया ✅ क्या अब यह ठीक चल रहा है?\n${topic}`,
  yes: 'हाँ, चालू है',
  still: 'अभी भी समस्या है',
  reopened: (name, when) =>
    `माफ़ कीजिए। हमने आपकी समस्या फिर से खोल दी है। *${name}* आपको ${when} फ़ोन करेंगे।`,
  fixedOld: 'धन्यवाद, हमने दर्ज कर लिया है।',
  homeFixed: (topic) => `क्या अब यह ठीक चल रहा है? ${topic}`,
  answerNow: 'अभी बताएँ',
  fixedWhat: 'समस्या की जाँच',
  fixedCancelled: 'यह बताने की अब ज़रूरत नहीं कि यह चल रहा है या नहीं। धन्यवाद।',
  none: 'अभी आपकी कोई समस्या खुली नहीं है।',
};

export const PROBLEM_LISTS = { en: EN, mr: MR, hi: HI };
export const PROBLEM_WORDS = localized(EN, { mr: MR, hi: HI });
