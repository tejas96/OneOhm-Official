import { localized, type Words } from '../whatsapp/assistant/language';

/** The referral and UPI payout words (redesign §15): the thank-you, the city tap, the UPI ask and the paid line. */
const EN = {
  formBody: 'Tell us about your friend. It takes a minute.',
  formButton: 'Refer a friend',
  askCity: (friend: string) => `Which city does ${friend} live in?`,
  pickCity: 'Pick a city',
  otherCity: 'Other city',
  thanks: (friend: string, reward: string | null) =>
    reward
      ? `Thank you! We'll call ${friend}. You get ${reward} when their solar is installed.`
      : `Thank you! We'll call ${friend}.`,
  perKw: (amount: string) => `${amount} for every kW`,
  shareButton: 'Share my link',
  shareText: (code: string, link: string | null) =>
    link
      ? `Forward this to your friends:\n${link}\nOr ask them to message us with your code *${code}*.`
      : `Ask your friends to message us with your code *${code}*.`,
  upiAsk: (amount: string) => `Share your UPI ID to receive ${amount}.`,
  upiButton: 'Share UPI ID',
  upiAgain: (reason: string) =>
    `We could not use your UPI ID${reason ? ` (${reason})` : ''}. Please share it again.`,
  upiType: 'Please type your UPI ID, like name@bank.',
  upiBad: 'That does not look like a UPI ID. It looks like name@bank. Please try again.',
  upiThanks: 'Thank you! Our team will check it and send your reward.',
  upiOld: 'That request is closed. Thank you!',
  paid: (amount: string) => `${amount} sent to your UPI ✅`,
};

const MR: Words<typeof EN> = {
  formBody: 'तुमच्या मित्राबद्दल सांगा. एक मिनिट लागतो.',
  formButton: 'मित्राला सांगा',
  askCity: (friend) => `${friend} कोणत्या शहरात राहतात?`,
  pickCity: 'शहर निवडा',
  otherCity: 'दुसरे शहर',
  thanks: (friend, reward) =>
    reward
      ? `धन्यवाद! आम्ही ${friend} यांना फोन करू. त्यांचा सोलर बसवल्यावर तुम्हाला ${reward} मिळतील.`
      : `धन्यवाद! आम्ही ${friend} यांना फोन करू.`,
  perKw: (amount) => `प्रत्येक kW साठी ${amount}`,
  shareButton: 'माझी लिंक पाठवा',
  shareText: (code, link) =>
    link
      ? `हे तुमच्या मित्रांना फॉरवर्ड करा:\n${link}\nकिंवा त्यांना तुमचा कोड *${code}* घेऊन आम्हाला मेसेज करायला सांगा.`
      : `तुमच्या मित्रांना तुमचा कोड *${code}* घेऊन आम्हाला मेसेज करायला सांगा.`,
  upiAsk: (amount) => `${amount} मिळवण्यासाठी तुमचा UPI आयडी द्या.`,
  upiButton: 'UPI आयडी द्या',
  upiAgain: (reason) =>
    `तुमचा UPI आयडी आम्हाला वापरता आला नाही${reason ? ` (${reason})` : ''}. कृपया तो पुन्हा द्या.`,
  upiType: 'कृपया तुमचा UPI आयडी टाइप करा, उदा. name@bank.',
  upiBad: 'हा UPI आयडी वाटत नाही. तो name@bank असा दिसतो. कृपया पुन्हा प्रयत्न करा.',
  upiThanks: 'धन्यवाद! आमची टीम तो तपासून तुमचे बक्षीस पाठवेल.',
  upiOld: 'ही विनंती बंद झाली आहे. धन्यवाद!',
  paid: (amount) => `${amount} तुमच्या UPI वर पाठवले ✅`,
};

const HI: Words<typeof EN> = {
  formBody: 'अपने दोस्त के बारे में बताएँ। एक मिनट लगता है।',
  formButton: 'दोस्त को बताएँ',
  askCity: (friend) => `${friend} किस शहर में रहते हैं?`,
  pickCity: 'शहर चुनें',
  otherCity: 'दूसरा शहर',
  thanks: (friend, reward) =>
    reward
      ? `धन्यवाद! हम ${friend} को फ़ोन करेंगे। उनका सोलर लगने पर आपको ${reward} मिलेंगे।`
      : `धन्यवाद! हम ${friend} को फ़ोन करेंगे।`,
  perKw: (amount) => `हर kW पर ${amount}`,
  shareButton: 'मेरी लिंक भेजें',
  shareText: (code, link) =>
    link
      ? `इसे अपने दोस्तों को फ़ॉरवर्ड करें:\n${link}\nया उनसे कहें कि आपका कोड *${code}* लिखकर हमें मैसेज करें।`
      : `अपने दोस्तों से कहें कि आपका कोड *${code}* लिखकर हमें मैसेज करें।`,
  upiAsk: (amount) => `${amount} पाने के लिए अपना UPI आईडी दें।`,
  upiButton: 'UPI आईडी दें',
  upiAgain: (reason) =>
    `हम आपका UPI आईडी इस्तेमाल नहीं कर सके${reason ? ` (${reason})` : ''}। कृपया उसे फिर से दें।`,
  upiType: 'कृपया अपना UPI आईडी लिखें, जैसे name@bank।',
  upiBad: 'यह UPI आईडी जैसा नहीं लगता। यह name@bank जैसा दिखता है। कृपया फिर कोशिश करें।',
  upiThanks: 'धन्यवाद! हमारी टीम इसे जाँचकर आपका इनाम भेजेगी।',
  upiOld: 'यह अनुरोध बंद हो गया है। धन्यवाद!',
  paid: (amount) => `${amount} आपके UPI पर भेज दिए ✅`,
};

export const REFER_LISTS = { en: EN, mr: MR, hi: HI };
export const REFER_WORDS = localized(EN, { mr: MR, hi: HI });
