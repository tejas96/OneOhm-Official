import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * Everything the customer reads in the self site survey (redesign §7), in English, Marathi and Hindi:
 * the offer, the questions in the chat, the answers' names, the thanks. We speak as "we". Buttons are
 * 20 characters at most, list rows 24 (survey-words.test.ts). Drafted by the team: have a native
 * speaker read the Marathi and Hindi once.
 */
const EN = {
  buttons: { start: 'Start survey', visit: 'Book a visit instead', finish: 'Finish survey' },
  offer: (amount: string) =>
    `Do your own site survey in 5 minutes and get *${amount} off* your next payment. Our engineer checks your photos - no visit needed.`,
  homeFinish: 'Finish your site survey - it takes a few minutes.',
  formBody:
    'Tap the button, answer a few questions and send 4 photos from your camera.\n\nOr just answer here in the chat.',
  formButton: 'Start survey',
  chatIntro: "Let's start. We ask one thing at a time. You can stop any time and continue later.",
  ask: {
    roof: 'What is your roof made of?',
    floors: 'How many floors does your building have?',
    shade: 'Does shade fall on your roof?',
    size: 'About how big is your roof?',
    consumer: 'Please type your electricity consumer number. It is on your bill.',
    corner_a: 'Please send a photo of one corner of your roof (corner A). Send the photo here.',
    corner_b: 'Now a photo of the opposite corner of your roof (corner B). Send the photo here.',
    meter: 'Please send a photo of your electricity meter. The meter number must be readable.',
    board: 'Please send a photo of your main switch board. Send the photo here.',
  },
  what: {
    roof: 'the roof type',
    floors: 'the number of floors',
    shade: 'the shade',
    size: 'the roof size',
    consumer: 'your consumer number',
    corner_a: 'the photo of roof corner A',
    corner_b: 'the photo of roof corner B',
    meter: 'the photo of your meter',
    board: 'the photo of your main switch board',
  },
  options: {
    roof: { rcc: 'RCC (concrete)', tin: 'Tin shed', tile: 'Tiled roof', other: 'Other' },
    floors: { '1': '1 floor', '2': '2 floors', '3': '3 floors', '4': '4 or more' },
    shade: {
      none: 'No shade',
      morning: 'Some in the morning',
      evening: 'Some in the evening',
      lot: 'A lot of shade',
    },
    size: {
      s1: 'Under 300 sq ft',
      s2: '300 to 600 sq ft',
      s3: '600 to 1000 sq ft',
      s4: 'Over 1000 sq ft',
      unknown: "I don't know",
    },
  },
  gotPhoto: 'Got it ✅',
  notPhoto: 'That was not a photo. Please send a photo here.',
  badNumber: 'That does not look like a consumer number. Please check your bill and type it again.',
  sent: 'Thank you ✅ We have your survey. Our engineer checks your photos and we tell you here. No visit needed.',
  approvedHead: 'Survey approved ✅',
  /** What follows "approved": the discount and the payment it comes off, said plainly. */
  clauseApplied: (amount: string, payment: string) => `${amount} off your payment: ${payment}.`,
  clausePending: (amount: string) => `${amount} will come off your final payment.`,
  clausePlain: 'Thank you.',
  reversed: (amount: string) =>
    `We had to take back the ${amount} survey discount from your payment. We will call you to explain.`,
  noNeed: 'Our engineer has finished your survey, so there is no need to send it now. Thank you.',
  askAgain: (what: string) =>
    `Our engineer needs one more thing from your survey: ${what}. We ask it again below.`,
  visitInstead: 'Okay, we will visit instead. Please pick a day.',
  old: 'That survey is closed. Tap Menu to see what we need now.',
  later: 'Okay. Your answers are saved. Send Menu any time to continue.',
};

const MR: Words<typeof EN> = {
  buttons: { start: 'सर्वे सुरू करा', visit: 'भेट बुक करा', finish: 'सर्वे पूर्ण करा' },
  offer: (amount) =>
    `५ मिनिटांत स्वतः साइट सर्वे करा आणि पुढच्या पेमेंटमध्ये *${amount} सूट* मिळवा. आमचे इंजिनिअर तुमचे फोटो तपासतात - भेट देण्याची गरज नाही.`,
  homeFinish: 'तुमचा साइट सर्वे पूर्ण करा - थोडा वेळ लागतो.',
  formBody: 'बटण दाबा, काही प्रश्नांची उत्तरे द्या आणि कॅमेऱ्याने ४ फोटो पाठवा.\n\nकिंवा इथेच चॅटमध्ये उत्तर द्या.',
  formButton: 'सर्वे सुरू करा',
  chatIntro: 'चला सुरू करू. आम्ही एका वेळी एकच गोष्ट विचारतो. तुम्ही कधीही थांबून नंतर पुढे करू शकता.',
  ask: {
    roof: 'तुमचे छत कशाचे आहे?',
    floors: 'तुमच्या इमारतीत किती मजले आहेत?',
    shade: 'तुमच्या छतावर सावली पडते का?',
    size: 'तुमचे छत साधारण किती मोठे आहे?',
    consumer: 'कृपया तुमचा वीज ग्राहक क्रमांक टाइप करा. तो बिलावर असतो.',
    corner_a: 'कृपया छताच्या एका कोपऱ्याचा (कोपरा A) फोटो पाठवा. फोटो इथेच पाठवा.',
    corner_b: 'आता छताच्या समोरच्या कोपऱ्याचा (कोपरा B) फोटो पाठवा. फोटो इथेच पाठवा.',
    meter: 'कृपया वीज मीटरचा फोटो पाठवा. मीटर क्रमांक वाचता आला पाहिजे.',
    board: 'कृपया मुख्य स्विच बोर्डचा फोटो पाठवा. फोटो इथेच पाठवा.',
  },
  what: {
    roof: 'छताचा प्रकार',
    floors: 'मजल्यांची संख्या',
    shade: 'सावलीची माहिती',
    size: 'छताचा आकार',
    consumer: 'तुमचा ग्राहक क्रमांक',
    corner_a: 'छताच्या कोपरा A चा फोटो',
    corner_b: 'छताच्या कोपरा B चा फोटो',
    meter: 'मीटरचा फोटो',
    board: 'मुख्य स्विच बोर्डचा फोटो',
  },
  options: {
    roof: { rcc: 'आरसीसी (काँक्रीट)', tin: 'पत्र्याचे शेड', tile: 'कौलारू छत', other: 'इतर' },
    floors: { '1': '१ मजला', '2': '२ मजले', '3': '३ मजले', '4': '४ किंवा जास्त' },
    shade: { none: 'सावली नाही', morning: 'सकाळी थोडी', evening: 'संध्याकाळी थोडी', lot: 'खूप सावली' },
    size: {
      s1: '३०० चौ.फूट पेक्षा कमी',
      s2: '३०० ते ६०० चौ.फूट',
      s3: '६०० ते १००० चौ.फूट',
      s4: '१००० चौ.फूट पेक्षा जास्त',
      unknown: 'मला माहीत नाही',
    },
  },
  gotPhoto: 'मिळाले ✅',
  notPhoto: 'तो फोटो नव्हता. कृपया फोटो इथे पाठवा.',
  badNumber: 'हा ग्राहक क्रमांक वाटत नाही. कृपया बिल पाहून पुन्हा टाइप करा.',
  sent: 'धन्यवाद ✅ तुमचा सर्वे मिळाला. आमचे इंजिनिअर फोटो तपासतात आणि आम्ही इथे कळवू. भेट देण्याची गरज नाही.',
  approvedHead: 'सर्वे मंजूर ✅',
  clauseApplied: (amount, payment) => `तुमच्या पेमेंटमध्ये (${payment}) ${amount} सूट.`,
  clausePending: (amount) => `तुमच्या शेवटच्या पेमेंटमधून ${amount} कमी होतील.`,
  clausePlain: 'धन्यवाद.',
  reversed: (amount) => `सर्वेची ${amount} सूट आम्हाला तुमच्या पेमेंटमधून परत घ्यावी लागली. आम्ही फोन करून सांगू.`,
  noNeed: 'आमच्या इंजिनिअरनी तुमचा सर्वे पूर्ण केला आहे, त्यामुळे आता पाठवण्याची गरज नाही. धन्यवाद.',
  askAgain: (what) =>
    `आमच्या इंजिनिअरना तुमच्या सर्वेमधून आणखी एक गोष्ट हवी आहे: ${what}. आम्ही खाली पुन्हा विचारतो.`,
  visitInstead: 'ठीक आहे, आम्ही भेट देऊ. कृपया एक दिवस निवडा.',
  old: 'तो सर्वे बंद झाला आहे. आता काय हवे ते पाहण्यासाठी Menu दाबा.',
  later: 'ठीक आहे. तुमची उत्तरे जतन आहेत. पुढे जाण्यासाठी कधीही Menu पाठवा.',
};

const HI: Words<typeof EN> = {
  buttons: { start: 'सर्वे शुरू करें', visit: 'विज़िट बुक करें', finish: 'सर्वे पूरा करें' },
  offer: (amount) =>
    `5 मिनट में खुद साइट सर्वे करें और अगले पेमेंट में *${amount} की छूट* पाएँ। हमारे इंजीनियर आपकी फ़ोटो जाँचते हैं - विज़िट की ज़रूरत नहीं।`,
  homeFinish: 'अपना साइट सर्वे पूरा करें - थोड़ा समय लगता है।',
  formBody: 'बटन दबाएँ, कुछ सवालों के जवाब दें और कैमरे से 4 फ़ोटो भेजें।\n\nया यहीं चैट में जवाब दें।',
  formButton: 'सर्वे शुरू करें',
  chatIntro: 'चलिए शुरू करें। हम एक बार में एक ही बात पूछते हैं। आप कभी भी रुककर बाद में आगे बढ़ा सकते हैं।',
  ask: {
    roof: 'आपकी छत किस चीज़ की है?',
    floors: 'आपकी इमारत में कितनी मंज़िलें हैं?',
    shade: 'क्या आपकी छत पर छाया पड़ती है?',
    size: 'आपकी छत लगभग कितनी बड़ी है?',
    consumer: 'कृपया अपना बिजली उपभोक्ता नंबर टाइप करें। यह बिल पर होता है।',
    corner_a: 'कृपया छत के एक कोने (कोना A) की फ़ोटो भेजें। फ़ोटो यहीं भेजें।',
    corner_b: 'अब छत के सामने वाले कोने (कोना B) की फ़ोटो भेजें। फ़ोटो यहीं भेजें।',
    meter: 'कृपया बिजली मीटर की फ़ोटो भेजें। मीटर नंबर पढ़ने लायक होना चाहिए।',
    board: 'कृपया मुख्य स्विच बोर्ड की फ़ोटो भेजें। फ़ोटो यहीं भेजें।',
  },
  what: {
    roof: 'छत का प्रकार',
    floors: 'मंज़िलों की संख्या',
    shade: 'छाया की जानकारी',
    size: 'छत का आकार',
    consumer: 'आपका उपभोक्ता नंबर',
    corner_a: 'छत के कोने A की फ़ोटो',
    corner_b: 'छत के कोने B की फ़ोटो',
    meter: 'मीटर की फ़ोटो',
    board: 'मुख्य स्विच बोर्ड की फ़ोटो',
  },
  options: {
    roof: { rcc: 'आरसीसी (कंक्रीट)', tin: 'टीन शेड', tile: 'खपरैल की छत', other: 'अन्य' },
    floors: { '1': '1 मंज़िल', '2': '2 मंज़िलें', '3': '3 मंज़िलें', '4': '4 या ज़्यादा' },
    shade: { none: 'छाया नहीं', morning: 'सुबह थोड़ी', evening: 'शाम को थोड़ी', lot: 'बहुत छाया' },
    size: {
      s1: '300 वर्ग फ़ुट से कम',
      s2: '300 से 600 वर्ग फ़ुट',
      s3: '600 से 1000 वर्ग फ़ुट',
      s4: '1000 वर्ग फ़ुट से अधिक',
      unknown: 'मुझे नहीं पता',
    },
  },
  gotPhoto: 'मिल गई ✅',
  notPhoto: 'यह फ़ोटो नहीं थी। कृपया फ़ोटो यहाँ भेजें।',
  badNumber: 'यह उपभोक्ता नंबर नहीं लगता। कृपया बिल देखकर फिर से टाइप करें।',
  sent: 'धन्यवाद ✅ आपका सर्वे मिल गया। हमारे इंजीनियर फ़ोटो जाँचते हैं और हम यहाँ बताएँगे। विज़िट की ज़रूरत नहीं।',
  approvedHead: 'सर्वे मंज़ूर ✅',
  clauseApplied: (amount, payment) => `आपके पेमेंट (${payment}) में ${amount} की छूट।`,
  clausePending: (amount) => `आपके आख़िरी पेमेंट से ${amount} कम होंगे।`,
  clausePlain: 'धन्यवाद।',
  reversed: (amount) => `सर्वे की ${amount} की छूट हमें आपके पेमेंट से वापस लेनी पड़ी। हम फ़ोन करके बताएँगे।`,
  noNeed: 'हमारे इंजीनियर ने आपका सर्वे पूरा कर लिया है, इसलिए अब भेजने की ज़रूरत नहीं। धन्यवाद।',
  askAgain: (what) => `हमारे इंजीनियर को आपके सर्वे से एक और चीज़ चाहिए: ${what}। हम नीचे फिर से पूछते हैं।`,
  visitInstead: 'ठीक है, हम विज़िट करेंगे। कृपया एक दिन चुनें।',
  old: 'वह सर्वे बंद हो गया है। अभी क्या चाहिए यह देखने के लिए Menu दबाएँ।',
  later: 'ठीक है। आपके जवाब सुरक्षित हैं। आगे बढ़ने के लिए कभी भी Menu भेजें।',
};

export const SURVEY_LISTS = { en: EN, mr: MR, hi: HI };
export const SURVEY_WORDS = localized(EN, { mr: MR, hi: HI });
