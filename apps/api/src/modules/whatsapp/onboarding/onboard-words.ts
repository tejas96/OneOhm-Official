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
  preparing: 'Thank you! We are preparing your estimate. It will come here shortly.',
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
  preparing: 'धन्यवाद! आम्ही तुमचा अंदाज (एस्टिमेट) तयार करत आहोत. तो लवकरच इथे येईल.',
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
  preparing: 'धन्यवाद! हम आपका अनुमान (एस्टिमेट) तैयार कर रहे हैं. यह जल्द ही यहाँ आएगा.',
};

/** Every language, for the limit checks. */
export const ONBOARD_LISTS = { en: EN_ONBOARD, mr: MR_ONBOARD, hi: HI_ONBOARD };

export const ONBOARD_WORDS = localized(EN_ONBOARD, { mr: MR_ONBOARD, hi: HI_ONBOARD });
