import { localized, type Words } from '../assistant/language';

/**
 * What the onboarding bot says to a new number, in English, Marathi and Hindi (kept here
 * because `words.ts` is full). Button titles stay within 20 characters and list rows
 * within 24, as WhatsApp requires; `words.test.ts` checks them.
 */
const EN_ONBOARD = {
  /** Asked before a language is known, so it is the same in every language. */
  askLanguage: 'Hello! Please choose your language.\nकृपया तुमची भाषा निवडा.\nकृपया अपनी भाषा चुनें.',
  languages: { en: 'English', mr: 'मराठी', hi: 'हिंदी' },
  askName: (name: string) => `Shall we call you ${name}?`,
  yes: 'Yes',
  change: 'Change',
  typeName: 'Please type your name.',
  askCity: 'Which city is your home or site in?',
  otherCity: 'Other city',
  typeCity: 'Please type your city name.',
  choose: 'Choose',
  askSite: 'Where do you want solar?',
  sites: { home: 'Home', society: 'Housing society', business: 'Shop or business', farm: 'Farm' },
  askBill: 'About how much is your monthly electricity bill?',
  askRoof: 'What is the roof like?',
  roofs: { rcc: 'RCC slab', tin: 'Tin sheet', other: 'Other' },
  askFloors: 'How many floors does the building have?',
  floors: { 1: 'Ground only', 2: '2 floors', 3: '3 or more' },
  askPhoto:
    'Please send a photo of your latest electricity bill. It helps us size your system right.',
  sendLater: 'Send later',
  talkToPerson: 'Talk to a person',
  /** Before the question again, after one unclear answer. */
  notClear: 'Sorry, I did not get that. Please tap one option below.',
  notClearTyped: 'Sorry, I did not get that. Please type it again.',
  /** With the estimate PDF; the second line is the same as on the PDF. */
  estimateCaption: (size: string, price: string, after: string) =>
    `Your solar estimate: ${size}, ${price} (${after} after subsidy).\nEstimate — final price in your quotation after a free call or visit.`,
  estimateNext: 'What would you like to do next?',
  callMeBack: 'Call me back',
  notNow: 'Not now',
  askWhenLater: 'When should we check back with you?',
  later: { '1w': 'In 1 week', '1m': 'In 1 month', '3m': 'In 3 months' },
  willCall: (name: string | null) => `Thank you. ${name ?? 'Our team'} will call you today.`,
  laterThanks: 'Thank you! We will check back with you then.',
  /** No instant price for this site (a farm, a society, other roof…): a person prices it. */
  expertPrice: 'Thank you! Our expert will prepare your price and call you.',
};

export type OnboardWords = typeof EN_ONBOARD;

const MR_ONBOARD: Words<OnboardWords> = {
  askLanguage: EN_ONBOARD.askLanguage,
  languages: EN_ONBOARD.languages,
  askName: (name) => `आम्ही तुम्हाला ${name} म्हणू का?`,
  yes: 'हो',
  change: 'बदला',
  typeName: 'कृपया तुमचे नाव लिहा.',
  askCity: 'तुमचे घर किंवा साइट कोणत्या शहरात आहे?',
  otherCity: 'दुसरे शहर',
  typeCity: 'कृपया तुमच्या शहराचे नाव लिहा.',
  choose: 'निवडा',
  askSite: 'सोलर कुठे बसवायचे आहे?',
  sites: { home: 'घर', society: 'हाउसिंग सोसायटी', business: 'दुकान किंवा व्यवसाय', farm: 'शेत' },
  askBill: 'तुमचे महिन्याचे वीज बिल साधारण किती येते?',
  askRoof: 'छत कसे आहे?',
  roofs: { rcc: 'RCC स्लॅब', tin: 'पत्र्याचे छत', other: 'इतर' },
  askFloors: 'इमारत किती मजली आहे?',
  floors: { 1: 'फक्त तळमजला', 2: '2 मजले', 3: '3 किंवा जास्त' },
  askPhoto: 'कृपया तुमच्या नवीन वीज बिलाचा फोटो पाठवा. त्यामुळे योग्य सिस्टम ठरवता येते.',
  sendLater: 'नंतर पाठवतो',
  talkToPerson: 'व्यक्तीशी बोला',
  notClear: 'माफ करा, समजले नाही. कृपया खालीलपैकी एक पर्याय दाबा.',
  notClearTyped: 'माफ करा, समजले नाही. कृपया पुन्हा लिहा.',
  estimateCaption: (size, price, after) =>
    `तुमचा सोलर अंदाज: ${size}, ${price} (सबसिडीनंतर ${after}).\nहा अंदाज आहे — मोफत कॉल किंवा भेटीनंतर कोटेशनमध्ये अंतिम किंमत.`,
  estimateNext: 'पुढे काय करायचे?',
  callMeBack: 'मला कॉल करा',
  notNow: 'आत्ता नको',
  askWhenLater: 'आम्ही तुम्हाला पुन्हा केव्हा संपर्क करू?',
  later: { '1w': '1 आठवड्यात', '1m': '1 महिन्यात', '3m': '3 महिन्यांत' },
  willCall: (name) => `धन्यवाद. आज ${name ?? 'आमच्या टीम'}कडून तुम्हाला कॉल येईल.`,
  laterThanks: 'धन्यवाद! आम्ही तेव्हा तुमच्याशी पुन्हा संपर्क करू.',
  expertPrice: 'धन्यवाद! आमचे तज्ज्ञ तुमची किंमत तयार करून तुम्हाला कॉल करतील.',
};

const HI_ONBOARD: Words<OnboardWords> = {
  askLanguage: EN_ONBOARD.askLanguage,
  languages: EN_ONBOARD.languages,
  askName: (name) => `क्या हम आपको ${name} कहें?`,
  yes: 'हाँ',
  change: 'बदलें',
  typeName: 'कृपया अपना नाम लिखें.',
  askCity: 'आपका घर या साइट किस शहर में है?',
  otherCity: 'दूसरा शहर',
  typeCity: 'कृपया अपने शहर का नाम लिखें.',
  choose: 'चुनें',
  askSite: 'सोलर कहाँ लगवाना है?',
  sites: { home: 'घर', society: 'हाउसिंग सोसाइटी', business: 'दुकान या व्यवसाय', farm: 'खेत' },
  askBill: 'आपका महीने का बिजली बिल लगभग कितना आता है?',
  askRoof: 'छत कैसी है?',
  roofs: { rcc: 'RCC स्लैब', tin: 'टीन शेड', other: 'अन्य' },
  askFloors: 'इमारत कितनी मंज़िल की है?',
  floors: { 1: 'सिर्फ़ ग्राउंड', 2: '2 मंज़िल', 3: '3 या ज़्यादा' },
  askPhoto: 'कृपया अपने नए बिजली बिल की फोटो भेजें. इससे सही सिस्टम तय होता है.',
  sendLater: 'बाद में भेजूँगा',
  talkToPerson: 'व्यक्ति से बात करें',
  notClear: 'माफ़ कीजिए, समझ नहीं आया. कृपया नीचे से एक विकल्प दबाएँ.',
  notClearTyped: 'माफ़ कीजिए, समझ नहीं आया. कृपया फिर से लिखें.',
  estimateCaption: (size, price, after) =>
    `आपका सोलर अनुमान: ${size}, ${price} (सब्सिडी के बाद ${after}).\nयह अनुमान है — मुफ़्त कॉल या विज़िट के बाद कोटेशन में अंतिम कीमत.`,
  estimateNext: 'आगे क्या करना चाहेंगे?',
  callMeBack: 'मुझे कॉल करें',
  notNow: 'अभी नहीं',
  askWhenLater: 'हम आपसे फिर कब संपर्क करें?',
  later: { '1w': '1 हफ़्ते में', '1m': '1 महीने में', '3m': '3 महीने में' },
  willCall: (name) => `धन्यवाद. आज ${name ?? 'हमारी टीम'} की ओर से आपको कॉल आएगा.`,
  laterThanks: 'धन्यवाद! हम तब आपसे फिर संपर्क करेंगे.',
  expertPrice: 'धन्यवाद! हमारे विशेषज्ञ आपकी कीमत तैयार करके आपको कॉल करेंगे.',
};

/** Every language, for the limit checks. */
export const ONBOARD_LISTS = { en: EN_ONBOARD, mr: MR_ONBOARD, hi: HI_ONBOARD };

export const ONBOARD_WORDS = localized(EN_ONBOARD, { mr: MR_ONBOARD, hi: HI_ONBOARD });
