import { localized, type Words } from '../assistant/language';

/**
 * More words of the onboarding bot (phase 7): the location button, the visit pick under the estimate, the
 * hello to a lead the team made, and the short replies after the estimate. English, Marathi and Hindi;
 * button titles within 20 characters, checked by `words.test.ts`.
 */
const EN = {
  sendLocation: '📍 Send location',
  locationAsk: 'Tap the button to share your location. We use it to find your city.',
  pinNoCity: 'Thanks, we have your location. Which city is it in?',
  nameAgain: 'Please type your name in letters, like Suresh Patil.',
  bookVisit: 'Book a visit',
  callMe: 'Call me',
  /** "ok", "thanks", a 👍 after the estimate. */
  afterEstimate: 'You are welcome! Tap an option whenever you are ready.',
  /** A bill after the estimate: the buttons are not sent again. */
  visitDay: 'Which day suits you for the free site visit?',
  visitSlot: (day: string) => `${day}: morning or afternoon?`,
  visitNone: (name: string | null) =>
    `We have no free day to show right now. ${name ?? 'Our team'} will call you to fix one.`,
  visitDone: (name: string | null, by: string) =>
    `Thank you! ${name ?? 'Our team'} will confirm your visit by ${by}.`,
  quickEstimate: 'Quick estimate',
  leadHello: (name: string, owner: string | null) =>
    `Hi ${name} 👋 ${owner ? `${owner} from OneOhm is` : 'Our team at OneOhm is'} helping you.`,
  talkTo: (name: string | null) => (name ? `Talk to ${name}` : 'Talk to our team'),
  /** A bill or paper sent when the bot is off for new numbers: kept for our team. */
  fileKept: 'Thank you. We have your file and our team will check it and call you.',
  /** The stranger who stopped our messages and writes again. */
};

export type MoreWords = typeof EN;

const MR: Words<MoreWords> = {
  sendLocation: '📍 लोकेशन पाठवा',
  locationAsk: 'तुमचे लोकेशन देण्यासाठी बटण दाबा. त्यावरून आम्ही तुमचे शहर ओळखतो.',
  pinNoCity: 'धन्यवाद, तुमचे लोकेशन मिळाले. ते कोणत्या शहरात आहे?',
  nameAgain: 'कृपया तुमचे नाव अक्षरांत लिहा, जसे सुरेश पाटील.',
  bookVisit: 'भेट ठरवा',
  callMe: 'मला कॉल करा',
  afterEstimate: 'स्वागत आहे! तयार असाल तेव्हा खालील पर्याय दाबा.',
  visitDay: 'मोफत साइट भेटीसाठी कोणता दिवस सोयीचा आहे?',
  visitSlot: (day) => `${day}: सकाळी की दुपारी?`,
  visitNone: (name) =>
    `सध्या दाखवण्यासाठी मोकळा दिवस नाही. ${name ?? 'आमची टीम'} तुम्हाला कॉल करून दिवस ठरवेल.`,
  visitDone: (name, by) => `धन्यवाद! ${name ?? 'आमची टीम'} तुमची भेट ${by} पर्यंत पक्की करेल.`,
  quickEstimate: 'झटपट अंदाज',
  leadHello: (name, owner) =>
    `नमस्कार ${name} 👋 ${owner ? `OneOhm चे ${owner}` : 'OneOhm ची टीम'} तुम्हाला मदत करत आहे.`,
  talkTo: (name) => (name ? `${name} शी बोला` : 'टीमशी बोला'),
  fileKept: 'धन्यवाद. तुमची फाईल मिळाली, आमची टीम ती तपासून तुम्हाला कॉल करेल.',
};

const HI: Words<MoreWords> = {
  sendLocation: '📍 लोकेशन भेजें',
  locationAsk: 'अपना लोकेशन देने के लिए बटन दबाएँ. इससे हम आपका शहर पहचानते हैं.',
  pinNoCity: 'धन्यवाद, आपका लोकेशन मिल गया. यह किस शहर में है?',
  nameAgain: 'कृपया अपना नाम अक्षरों में लिखें, जैसे सुरेश पाटिल.',
  bookVisit: 'विज़िट बुक करें',
  callMe: 'मुझे कॉल करें',
  afterEstimate: 'आपका स्वागत है! तैयार हों तब नीचे का कोई विकल्प दबाएँ.',
  visitDay: 'मुफ़्त साइट विज़िट के लिए कौन सा दिन ठीक रहेगा?',
  visitSlot: (day) => `${day}: सुबह या दोपहर?`,
  visitNone: (name) =>
    `अभी दिखाने के लिए कोई खाली दिन नहीं है. ${name ?? 'हमारी टीम'} आपको कॉल करके दिन तय करेगी.`,
  visitDone: (name, by) => `धन्यवाद! ${name ?? 'हमारी टीम'} आपकी विज़िट ${by} तक पक्की करेगी.`,
  quickEstimate: 'झटपट अनुमान',
  leadHello: (name, owner) =>
    `नमस्ते ${name} 👋 ${owner ? `OneOhm से ${owner}` : 'OneOhm की टीम'} आपकी मदद कर रही है.`,
  talkTo: (name) => (name ? `${name} से बात करें` : 'टीम से बात करें'),
  fileKept: 'धन्यवाद. आपकी फ़ाइल मिल गई, हमारी टीम इसे देखकर आपको कॉल करेगी.',
};

export const MORE_LISTS = { en: EN, mr: MR, hi: HI };
export const MORE_WORDS = localized(EN, { mr: MR, hi: HI });
