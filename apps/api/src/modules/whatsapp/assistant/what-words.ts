import { localized, type Words } from './language';

/**
 * "What is this?" (redesign 5.2): the question about files a customer sent, its answers
 * and the Saved reply, in the "we" voice. Buttons keep 20 characters, list rows 24 and
 * their descriptions 72 in every language (chat-words.test.ts checks them).
 */
const EN_WHAT = {
  buttons: {
    yes: 'Yes',
    else: 'Something else',
    different: "They're different",
    change: 'Change',
    whatAreThey: 'What are they?',
  },
  choose: 'Choose',
  ask: 'What is this?',
  askMany: (count: number, photos: boolean) =>
    `Got your ${count} ${photos ? 'photos' : 'files'} ✅ What are they?`,
  askEach: (n: number, of: number) => `File ${n} of ${of} — what is it?`,
  confirmProblem: (count: number, photos = true) =>
    count === 1
      ? `Is this ${photos ? 'a photo ' : ''}for the problem you told us about?`
      : `Are these ${photos ? 'photos ' : ''}for the problem you told us about?`,
  confirmOne: (paper: string, home: string | null) =>
    `Is this your *${paper}*${home ? ` for ${home}` : ''}?`,
  confirmMany: (count: number, photos: boolean, paper: string, home: string | null) =>
    `Got your ${count} ${photos ? 'photos' : 'files'} ✅ Are they your *${paper}*${home ? ` for ${home}` : ''}?`,
  rows: {
    pay: { title: 'Payment proof', description: 'Money you paid us' },
    problem: { title: 'Problem photo', description: 'Something is wrong' },
    problemAdd: {
      title: 'Photo for your problem',
      description: 'Add it to the problem you told us',
    },
    other: { title: 'Something else', description: 'Any other paper or photo' },
    different: { title: "They're different", description: 'We ask about each one' },
  },
  allHomes: 'For all your homes',
  whichHome: 'For which home?',
  saved: (paper: string, home: string | null) =>
    `Saved ✅ *${paper}*${home ? ` · ${home}` : ''}. We'll check it.`,
  savedMany: (count: number, paper: string, home: string | null) =>
    `Saved ✅ ${count} files as *${paper}*${home ? ` · ${home}` : ''}. We'll check them.`,
  stillNeed: (paper: string) => `We still need your *${paper}*.`,
  /** A file with no kind (category other): named "Your file", never "Other file". */
  otherFile: 'Your file',
  savedOther: (home: string | null) =>
    `Saved ✅ Your file${home ? ` · ${home}` : ''}. We'll check it.`,
  savedOtherMany: (count: number, home: string | null) =>
    `Saved ✅ Your ${count} files${home ? ` · ${home}` : ''}. We'll check them.`,
  payment: "Thanks — we'll confirm your payment within 1 working day.",
  old: 'That question is old — what are these files?',
  changeLate: "We can't change that one here any more. Tell us and we'll fix it.",
  homeLine: (count: number) =>
    count === 1 ? 'You have 1 file not saved yet.' : `You have ${count} files not saved yet.`,
};

const MR_WHAT: Words<typeof EN_WHAT> = {
  buttons: {
    yes: 'होय',
    else: 'दुसरे काहीतरी',
    different: 'त्या वेगळ्या आहेत',
    change: 'बदला',
    whatAreThey: 'त्या काय आहेत?',
  },
  choose: 'निवडा',
  ask: 'हे काय आहे?',
  askMany: (count, photos) => `तुमचे ${count} ${photos ? 'फोटो' : 'फाइल'} मिळाले ✅ ते काय आहेत?`,
  askEach: (n, of) => `${of} पैकी फाइल ${n} — ही काय आहे?`,
  confirmProblem: (count, photos = true) =>
    count === 1
      ? `हा तुम्ही सांगितलेल्या समस्येचा ${photos ? 'फोटो ' : ''}आहे का?`
      : `हे तुम्ही सांगितलेल्या समस्येचे ${photos ? 'फोटो ' : ''}आहेत का?`,
  confirmOne: (paper, home) => `हे ${home ? `${home} साठीचे ` : ''}तुमचे *${paper}* आहे का?`,
  confirmMany: (count, photos, paper, home) =>
    `तुमचे ${count} ${photos ? 'फोटो' : 'फाइल'} मिळाले ✅ ते ${home ? `${home} साठीचे ` : ''}तुमचे *${paper}* आहेत का?`,
  rows: {
    pay: { title: 'पेमेंटचा पुरावा', description: 'तुम्ही आम्हाला दिलेले पैसे' },
    problem: { title: 'समस्येचा फोटो', description: 'काहीतरी बिघडले आहे' },
    problemAdd: { title: 'तुमच्या समस्येचा फोटो', description: 'तुम्ही सांगितलेल्या समस्येला जोडा' },
    other: { title: 'दुसरे काहीतरी', description: 'इतर कोणताही कागद किंवा फोटो' },
    different: { title: 'त्या वेगळ्या आहेत', description: 'आम्ही प्रत्येकाबद्दल विचारू' },
  },
  allHomes: 'तुमच्या सर्व घरांसाठी',
  whichHome: 'हे कोणत्या घरासाठी आहे?',
  saved: (paper, home) => `जतन केले ✅ *${paper}*${home ? ` · ${home}` : ''}. आम्ही ते तपासू.`,
  savedMany: (count, paper, home) =>
    `जतन केले ✅ ${count} फाइल *${paper}* म्हणून${home ? ` · ${home}` : ''}. आम्ही त्या तपासू.`,
  stillNeed: (paper) => `आम्हाला अजून तुमचे *${paper}* हवे आहे.`,
  otherFile: 'तुमची फाइल',
  savedOther: (home) => `जतन केले ✅ तुमची फाइल${home ? ` · ${home}` : ''}. आम्ही ती तपासू.`,
  savedOtherMany: (count, home) =>
    `जतन केले ✅ तुमच्या ${count} फाइल${home ? ` · ${home}` : ''}. आम्ही त्या तपासू.`,
  payment: 'धन्यवाद — तुमचे पेमेंट आम्ही 1 कामाच्या दिवसात पक्के करू.',
  old: 'तो प्रश्न जुना झाला आहे — या फाइल काय आहेत?',
  changeLate: 'ते इथून आता बदलता येत नाही. आम्हाला सांगा, आम्ही ते दुरुस्त करू.',
  homeLine: (count) => `तुमच्या ${count} फाइल अजून जतन केलेल्या नाहीत.`,
};

const HI_WHAT: Words<typeof EN_WHAT> = {
  buttons: {
    yes: 'हाँ',
    else: 'कुछ और',
    different: 'ये अलग-अलग हैं',
    change: 'बदलें',
    whatAreThey: 'ये क्या हैं?',
  },
  choose: 'चुनें',
  ask: 'यह क्या है?',
  askMany: (count, photos) => `आपकी ${count} ${photos ? 'फ़ोटो' : 'फ़ाइलें'} मिल गईं ✅ ये क्या हैं?`,
  askEach: (n, of) => `${of} में से फ़ाइल ${n} — यह क्या है?`,
  confirmProblem: (count, photos = true) =>
    count === 1
      ? `क्या यह आपकी बताई समस्या ${photos ? 'की फ़ोटो ' : 'का '}है?`
      : `क्या ये आपकी बताई समस्या ${photos ? 'की फ़ोटो ' : 'के '}हैं?`,
  confirmOne: (paper, home) => `क्या यह ${home ? `${home} के लिए ` : ''}आपका *${paper}* है?`,
  confirmMany: (count, photos, paper, home) =>
    `आपकी ${count} ${photos ? 'फ़ोटो' : 'फ़ाइलें'} मिल गईं ✅ क्या ये ${home ? `${home} के लिए ` : ''}आपका *${paper}* हैं?`,
  rows: {
    pay: { title: 'भुगतान का सबूत', description: 'आपने हमें जो पैसे दिए' },
    problem: { title: 'समस्या की फ़ोटो', description: 'कुछ गड़बड़ है' },
    problemAdd: { title: 'आपकी समस्या की फ़ोटो', description: 'बताई गई समस्या में जोड़ें' },
    other: { title: 'कुछ और', description: 'कोई और कागज़ या फ़ोटो' },
    different: { title: 'ये अलग-अलग हैं', description: 'हम हर एक के बारे में पूछेंगे' },
  },
  allHomes: 'आपके सभी घरों के लिए',
  whichHome: 'यह किस घर के लिए है?',
  saved: (paper, home) => `सेव हो गया ✅ *${paper}*${home ? ` · ${home}` : ''}। हम इसे जाँचेंगे।`,
  savedMany: (count, paper, home) =>
    `सेव हो गया ✅ ${count} फ़ाइलें *${paper}* के रूप में${home ? ` · ${home}` : ''}। हम इन्हें जाँचेंगे।`,
  stillNeed: (paper) => `हमें अभी भी आपका *${paper}* चाहिए।`,
  otherFile: 'आपकी फ़ाइल',
  savedOther: (home) => `सेव हो गया ✅ आपकी फ़ाइल${home ? ` · ${home}` : ''}। हम इसे जाँचेंगे।`,
  savedOtherMany: (count, home) =>
    `सेव हो गया ✅ आपकी ${count} फ़ाइलें${home ? ` · ${home}` : ''}। हम इन्हें जाँचेंगे।`,
  payment: 'धन्यवाद — हम 1 कार्य-दिवस में आपके भुगतान की पुष्टि करेंगे।',
  old: 'वह सवाल पुराना हो गया है — ये फ़ाइलें क्या हैं?',
  changeLate: 'इसे अब यहाँ बदला नहीं जा सकता। हमें बताइए, हम ठीक कर देंगे।',
  homeLine: (count) => `आपकी ${count} फ़ाइलें अभी सेव नहीं हुई हैं।`,
};

/** Every language, for the checks. */
export const WHAT_LISTS = { en: EN_WHAT, mr: MR_WHAT, hi: HI_WHAT };
export const WHAT_WORDS = localized(EN_WHAT, { mr: MR_WHAT, hi: HI_WHAT });
