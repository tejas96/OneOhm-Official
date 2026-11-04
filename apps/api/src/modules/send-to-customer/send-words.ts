import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * What the customer reads when the team sends something from "Send to customer" and when they
 * answer it (redesign §6, §10, §14, §18), in the "we" voice, in English, Marathi and Hindi.
 * Buttons keep 20 characters (send-words.test.ts checks all three languages).
 */
const EN_SEND = {
  buttons: {
    paidOther: 'I paid another way',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    chooseHome: 'Choose a home',
    sendLocation: 'Send location',
    pickTime: 'Pick a time',
  },
  location: {
    ask: (home: string) =>
      `Please share the location of your *${home}* home so our team finds it easily.`,
    saved: (home: string) => `Thank you ✅ Location saved for your ${home} home.`,
    checking: (home: string) =>
      `Thank you ✅ We got the location of your ${home} home. Our team will check it.`,
    anyHome: 'solar',
    which: 'Which home is this location for?',
    same: (home: string) => `Thank you ✅ We already have this location for your ${home} home.`,
  },
  pay: {
    due: (amount: string, home: string) => `*${amount}* is due for your ${home} home.`,
    askProof: (amount: string, home: string) =>
      `If you have paid *${amount}* for your ${home} home another way, please send us the proof.`,
    chatProof:
      'Please send a photo of the payment proof here, and tell us the amount and the date. We will confirm within 1 working day.',
    thanks: "Thanks — we'll confirm within 1 working day.",
    paidAlready: 'That payment is already done ✅ Thank you.',
  },
  callback: {
    ask: (name: string) => `When should ${name} call you?`,
    thanks: (name: string, slot: string) => `Thank you ✅ ${name} will call you in the ${slot}.`,
    slots: { morning: 'morning', afternoon: 'afternoon', evening: 'evening' },
    team: 'our team',
    homeLine: 'Please pick a time for our call.',
    homeRow: 'Morning, afternoon or evening',
  },
  crew: (name: string, work: string, phone: string) =>
    `${name} from OneOhm will come for your *${work}*. You can call them on ${phone}.`,
  delay: (stage: string, reason: string) =>
    `Your *${stage}* is waiting: ${reason}. We'll update you.`,
  document: (name: string) => `Your ${name}`,
  /** The customer is told when the team cancels what they asked. */
  cancelled: {
    location: (home: string) =>
      `You do not need to share the location of your ${home} home any more. Thank you.`,
    pay: 'We are not waiting for a payment proof from you any more. Your payment is still due.',
    callback: 'You do not need to pick a time for the call any more. Thank you.',
    what: {
      location: 'sharing your location',
      pay: 'your payment proof',
      callback: 'a time for the call',
    },
  },
  old: 'That was an earlier message — we have noted what you sent.',
};

const MR_SEND: Words<typeof EN_SEND> = {
  buttons: {
    paidOther: 'दुसऱ्या मार्गे भरले',
    morning: 'सकाळी',
    afternoon: 'दुपारी',
    evening: 'संध्याकाळी',
    chooseHome: 'घर निवडा',
    sendLocation: 'लोकेशन पाठवा',
    pickTime: 'वेळ निवडा',
  },
  location: {
    ask: (home) => `कृपया तुमच्या *${home}* घराचे लोकेशन पाठवा, म्हणजे आमची टीम सहज पोहोचेल.`,
    saved: (home) => `धन्यवाद ✅ तुमच्या ${home} घराचे लोकेशन सेव्ह केले.`,
    checking: (home) => `धन्यवाद ✅ तुमच्या ${home} घराचे लोकेशन मिळाले. आमची टीम ते तपासेल.`,
    anyHome: 'सोलर',
    which: 'हे लोकेशन कोणत्या घराचे आहे?',
    same: (home) => `धन्यवाद ✅ तुमच्या ${home} घराचे हे लोकेशन आमच्याकडे आधीच आहे.`,
  },
  pay: {
    due: (amount, home) => `तुमच्या ${home} घरासाठी *${amount}* बाकी आहे.`,
    askProof: (amount, home) =>
      `तुमच्या ${home} घरासाठी *${amount}* दुसऱ्या मार्गाने भरले असतील, तर कृपया पुरावा पाठवा.`,
    chatProof:
      'कृपया पेमेंटच्या पुराव्याचा फोटो इथे पाठवा, आणि रक्कम व तारीख सांगा. आम्ही १ कामाच्या दिवसात खात्री करू.',
    thanks: 'धन्यवाद — आम्ही १ कामाच्या दिवसात खात्री करू.',
    paidAlready: 'ते पेमेंट आधीच झाले आहे ✅ धन्यवाद.',
  },
  callback: {
    ask: (name) => `${name} यांनी तुम्हाला कधी फोन करावा?`,
    thanks: (name, slot) => `धन्यवाद ✅ ${name} तुम्हाला ${slot} फोन करतील.`,
    slots: { morning: 'सकाळी', afternoon: 'दुपारी', evening: 'संध्याकाळी' },
    team: 'आमची टीम',
    homeLine: 'कृपया आमच्या फोनसाठी वेळ निवडा.',
    homeRow: 'सकाळी, दुपारी किंवा संध्याकाळी',
  },
  crew: (name, work, phone) =>
    `OneOhm चे ${name} तुमच्या *${work}* साठी येतील. तुम्ही त्यांना ${phone} वर फोन करू शकता.`,
  delay: (stage, reason) => `तुमचे *${stage}* थांबले आहे: ${reason}. पुढची माहिती आम्ही कळवू.`,
  document: (name) => `तुमचे ${name}`,
  cancelled: {
    location: (home) => `तुमच्या ${home} घराचे लोकेशन पाठवण्याची आता गरज नाही. धन्यवाद.`,
    pay: 'आम्ही आता तुमच्याकडून पेमेंटच्या पुराव्याची वाट पाहत नाही. तुमचे पेमेंट अजून बाकी आहे.',
    callback: 'फोनसाठी वेळ निवडण्याची आता गरज नाही. धन्यवाद.',
    what: {
      location: 'लोकेशन पाठवणे',
      pay: 'पेमेंटचा पुरावा',
      callback: 'फोनसाठी वेळ',
    },
  },
  old: 'तो आधीचा मेसेज होता — तुम्ही पाठवलेले आम्ही नोंदवले आहे.',
};

const HI_SEND: Words<typeof EN_SEND> = {
  buttons: {
    paidOther: 'दूसरे तरीके से भरा',
    morning: 'सुबह',
    afternoon: 'दोपहर',
    evening: 'शाम',
    chooseHome: 'घर चुनें',
    sendLocation: 'लोकेशन भेजें',
    pickTime: 'समय चुनें',
  },
  location: {
    ask: (home) => `कृपया अपने *${home}* घर की लोकेशन भेजें, ताकि हमारी टीम आसानी से पहुँच सके।`,
    saved: (home) => `धन्यवाद ✅ आपके ${home} घर की लोकेशन सेव कर ली।`,
    checking: (home) => `धन्यवाद ✅ आपके ${home} घर की लोकेशन मिल गई। हमारी टीम इसे जाँचेगी।`,
    anyHome: 'सोलर',
    which: 'यह लोकेशन किस घर की है?',
    same: (home) => `धन्यवाद ✅ आपके ${home} घर की यह लोकेशन हमारे पास पहले से है।`,
  },
  pay: {
    due: (amount, home) => `आपके ${home} घर के लिए *${amount}* बाकी है।`,
    askProof: (amount, home) =>
      `अगर आपने ${home} घर के लिए *${amount}* किसी और तरीके से भरा है, तो कृपया सबूत भेजें।`,
    chatProof: 'कृपया पेमेंट के सबूत की फ़ोटो यहाँ भेजें, और रकम व तारीख़ बताएँ। हम 1 कामकाजी दिन में पुष्टि करेंगे।',
    thanks: 'धन्यवाद — हम 1 कामकाजी दिन में पुष्टि करेंगे।',
    paidAlready: 'वह भुगतान हो चुका है ✅ धन्यवाद।',
  },
  callback: {
    ask: (name) => `${name} आपको कब फ़ोन करें?`,
    thanks: (name, slot) => `धन्यवाद ✅ ${name} आपको ${slot} फ़ोन करेंगे।`,
    slots: { morning: 'सुबह', afternoon: 'दोपहर', evening: 'शाम' },
    team: 'हमारी टीम',
    homeLine: 'कृपया हमारे फ़ोन के लिए समय चुनें।',
    homeRow: 'सुबह, दोपहर या शाम',
  },
  crew: (name, work, phone) =>
    `OneOhm से ${name} आपके *${work}* के लिए आएँगे। आप उन्हें ${phone} पर फ़ोन कर सकते हैं।`,
  delay: (stage, reason) => `आपका *${stage}* रुका हुआ है: ${reason}। आगे की जानकारी हम देंगे।`,
  document: (name) => `आपका ${name}`,
  cancelled: {
    location: (home) => `अब आपको ${home} घर की लोकेशन भेजने की ज़रूरत नहीं है। धन्यवाद।`,
    pay: 'अब हम आपसे भुगतान के सबूत का इंतज़ार नहीं कर रहे। आपका भुगतान अभी बाकी है।',
    callback: 'अब आपको फ़ोन के लिए समय चुनने की ज़रूरत नहीं है। धन्यवाद।',
    what: {
      location: 'लोकेशन भेजना',
      pay: 'पेमेंट का सबूत',
      callback: 'फ़ोन के लिए समय',
    },
  },
  old: 'वह पहले का संदेश था — आपने जो भेजा, हमने नोट कर लिया है।',
};

export const SEND_LISTS = { en: EN_SEND, mr: MR_SEND, hi: HI_SEND };
export const SEND_WORDS = localized(EN_SEND, { mr: MR_SEND, hi: HI_SEND });
