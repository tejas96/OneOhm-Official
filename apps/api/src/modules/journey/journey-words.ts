import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * What the customer reads for the journey steps (redesign §4, §18, §19): the paper to agree to, the
 * roof and installation checks, the handover pack and the automatic messages with buttons. "We" voice,
 * English, Marathi and Hindi. Buttons keep 20 characters (journey-words.test.ts checks all three).
 */
const EN_JOURNEY = {
  buttons: {
    agree: 'I agree',
    question: 'I have a question',
    sendPhoto: 'Send photo',
    yesReady: 'Yes, ready',
    notYet: 'Not yet',
    readyNow: "It's ready now",
    allGood: 'Yes, all good',
    wrong: 'Something is wrong',
    documents: 'Documents',
    warranty: 'Warranty & AMC',
    sendNow: 'Send it now',
    update: 'Project update',
    answerNow: 'Answer now',
  },
  sign: {
    ask: (paper: string, home: string) => `Please read your *${paper}* for ${home}.`,
    agreed: 'Thank you ✅ We have noted that you agree.\nPlease send a photo of the signed page.',
    ownOnly: (name: string) => `Only ${name}'s own number can agree to this.`,
    signedTitle: (paper: string) => `Signed ${paper}`,
    cancelled: (paper: string) => `You do not need to sign the ${paper} any more. Thank you.`,
    again: 'The photo of the signed page is still needed. Please send it here.',
    what: 'a paper to sign',
  },
  ready: {
    ask: (home: string) =>
      `Is the roof at *${home}* ready for installation? It needs a clear roof, a power point and someone at home.`,
    yes: 'Thank you ✅ We have noted that the roof is ready.',
    notYet: 'No problem — we have noted it. Tap the button when the roof is ready.',
    now: 'Thank you ✅ We have noted that the roof is ready. We will plan the next step.',
    what: 'the roof check',
  },
  install: {
    ask: (home: string) => `Is the installation at *${home}* finished to your satisfaction?`,
    yes: 'Thank you ✅ We are glad it went well.',
    wrong: (home: string) =>
      `We are sorry. Please tell us what is wrong with the installation at ${home}, in a few words or a photo.`,
    what: 'the installation check',
  },
  pack: {
    summary: (count: number, home: string) =>
      count === 1
        ? `Your *1* handover paper for ${home} is above.`
        : `Your *${count}* handover papers for ${home} are above.`,
    none: 'There are no handover papers to send yet.',
  },
  auto: {
    installStarted: (home: string) => `Our team started installing at ${home} today.`,
    switchedOn: (home: string, amount: string | null) =>
      amount
        ? `Your solar at ${home} is ON ☀️\nThe final payment of *${amount}* is now due.`
        : `Your solar at ${home} is ON ☀️\nYour warranty and free check-ups are one tap away.`,
    needs: (item: string) => `We need *${item}* to continue.`,
    waitingOn: (party: string, since: string) =>
      `Waiting for ${party} since ${since}. We'll update you.`,
    parties: { customer: 'you', bank: 'your bank', discom: 'the electricity board' },
  },
  confirmCancelled: 'You do not need to answer that question any more. Thank you.',
  old: 'That was an earlier message — we have noted what you sent.',
};

const MR_JOURNEY: Words<typeof EN_JOURNEY> = {
  buttons: {
    agree: 'मी सहमत आहे',
    question: 'मला प्रश्न आहे',
    sendPhoto: 'फोटो पाठवा',
    yesReady: 'हो, तयार आहे',
    notYet: 'अजून नाही',
    readyNow: 'आता तयार आहे',
    allGood: 'हो, सर्व ठीक',
    wrong: 'काहीतरी चुकले',
    documents: 'कागदपत्रे',
    warranty: 'वॉरंटी आणि AMC',
    sendNow: 'आत्ता पाठवा',
    update: 'प्रकल्पाची माहिती',
    answerNow: 'आता उत्तर द्या',
  },
  sign: {
    ask: (paper, home) => `कृपया ${home} साठीचे तुमचे *${paper}* वाचा.`,
    agreed: 'धन्यवाद ✅ तुम्ही सहमत असल्याची आम्ही नोंद केली.\nकृपया सही केलेल्या पानाचा फोटो पाठवा.',
    ownOnly: (name) => `यासाठी फक्त ${name} यांचा स्वतःचा नंबरच सहमती देऊ शकतो.`,
    signedTitle: (paper) => `सही केलेले ${paper}`,
    cancelled: (paper) => `${paper} वर सही करण्याची आता गरज नाही. धन्यवाद.`,
    again: 'सही केलेल्या पानाचा फोटो अजून हवा आहे. कृपया तो इथे पाठवा.',
    what: 'सही करायचे कागद',
  },
  ready: {
    ask: (home) =>
      `${home} येथील छप्पर बसवणीसाठी तयार आहे का? मोकळे छप्पर, एक पॉवर पॉइंट आणि घरी कोणीतरी हवे.`,
    yes: 'धन्यवाद ✅ छप्पर तयार असल्याची आम्ही नोंद केली.',
    notYet: 'काही हरकत नाही — नोंद केली. छप्पर तयार झाल्यावर बटण दाबा.',
    now: 'धन्यवाद ✅ छप्पर तयार असल्याची नोंद केली. आम्ही पुढची तयारी करू.',
    what: 'छप्पर तपासणी',
  },
  install: {
    ask: (home) => `${home} येथील बसवणी तुमच्या समाधानानुसार पूर्ण झाली आहे का?`,
    yes: 'धन्यवाद ✅ सगळे नीट झाले, याचा आनंद आहे.',
    wrong: (home) => `क्षमस्व. ${home} येथील बसवणीत काय चुकले ते थोडक्यात किंवा फोटोने सांगा.`,
    what: 'बसवणी तपासणी',
  },
  pack: {
    summary: (count, home) => `${home} साठीची तुमची *${count}* हस्तांतर कागदपत्रे वर आहेत.`,
    none: 'पाठवण्यासाठी अजून हस्तांतर कागदपत्रे नाहीत.',
  },
  auto: {
    installStarted: (home) => `आमच्या टीमने आज ${home} येथे बसवणी सुरू केली.`,
    switchedOn: (home, amount) =>
      amount
        ? `${home} येथील तुमचा सोलर सुरू झाला ☀️\nआता अंतिम पेमेंट *${amount}* बाकी आहे.`
        : `${home} येथील तुमचा सोलर सुरू झाला ☀️\nवॉरंटी आणि मोफत तपासण्या एका दाबावर.`,
    needs: (item) => `पुढे जाण्यासाठी आम्हाला *${item}* हवे आहे.`,
    waitingOn: (party, since) => `${since} पासून ${party} कडून उत्तराची वाट पाहत आहोत. आम्ही कळवू.`,
    parties: { customer: 'तुमच्याकडून', bank: 'तुमच्या बँकेकडून', discom: 'वीज मंडळाकडून' },
  },
  confirmCancelled: 'त्या प्रश्नाचे उत्तर देण्याची आता गरज नाही. धन्यवाद.',
  old: 'तो आधीचा मेसेज होता — तुम्ही पाठवलेले आम्ही नोंदवले आहे.',
};

const HI_JOURNEY: Words<typeof EN_JOURNEY> = {
  buttons: {
    agree: 'मैं सहमत हूँ',
    question: 'मेरा सवाल है',
    sendPhoto: 'फ़ोटो भेजें',
    yesReady: 'हाँ, तैयार है',
    notYet: 'अभी नहीं',
    readyNow: 'अब तैयार है',
    allGood: 'हाँ, सब ठीक',
    wrong: 'कुछ गड़बड़ है',
    documents: 'दस्तावेज़',
    warranty: 'वारंटी और AMC',
    sendNow: 'अभी भेजें',
    update: 'प्रोजेक्ट अपडेट',
    answerNow: 'अभी जवाब दें',
  },
  sign: {
    ask: (paper, home) => `कृपया ${home} के लिए अपना *${paper}* पढ़ें।`,
    agreed: 'धन्यवाद ✅ आपकी सहमति हमने दर्ज कर ली।\nकृपया हस्ताक्षर किए पन्ने की फ़ोटो भेजें।',
    ownOnly: (name) => `इसके लिए सिर्फ़ ${name} का अपना नंबर ही सहमति दे सकता है।`,
    signedTitle: (paper) => `हस्ताक्षर किया ${paper}`,
    cancelled: (paper) => `अब आपको ${paper} पर हस्ताक्षर करने की ज़रूरत नहीं है। धन्यवाद।`,
    again: 'हस्ताक्षर किए पन्ने की फ़ोटो अभी चाहिए। कृपया उसे यहाँ भेजें।',
    what: 'हस्ताक्षर वाला कागज़',
  },
  ready: {
    ask: (home) =>
      `क्या ${home} की छत इंस्टॉलेशन के लिए तैयार है? खाली छत, एक पावर पॉइंट और घर पर कोई होना चाहिए।`,
    yes: 'धन्यवाद ✅ छत तैयार है, यह हमने दर्ज कर लिया।',
    notYet: 'कोई बात नहीं — हमने दर्ज कर लिया। छत तैयार होने पर बटन दबाएँ।',
    now: 'धन्यवाद ✅ छत तैयार है, यह दर्ज कर लिया। हम अगला कदम तय करेंगे।',
    what: 'छत की जाँच',
  },
  install: {
    ask: (home) => `क्या ${home} पर इंस्टॉलेशन आपकी संतुष्टि के अनुसार पूरा हो गया है?`,
    yes: 'धन्यवाद ✅ सब ठीक रहा, यह जानकर खुशी हुई।',
    wrong: (home) => `हमें खेद है। ${home} पर इंस्टॉलेशन में क्या गड़बड़ है, कुछ शब्दों में या फ़ोटो से बताएँ।`,
    what: 'इंस्टॉलेशन की जाँच',
  },
  pack: {
    summary: (count, home) => `${home} के लिए आपके *${count}* हैंडओवर कागज़ ऊपर हैं।`,
    none: 'भेजने के लिए अभी हैंडओवर कागज़ नहीं हैं।',
  },
  auto: {
    installStarted: (home) => `हमारी टीम ने आज ${home} पर इंस्टॉलेशन शुरू किया।`,
    switchedOn: (home, amount) =>
      amount
        ? `${home} पर आपका सोलर चालू हो गया ☀️\nअब अंतिम भुगतान *${amount}* बाकी है।`
        : `${home} पर आपका सोलर चालू हो गया ☀️\nवारंटी और मुफ़्त जाँच बस एक टैप दूर।`,
    needs: (item) => `आगे बढ़ने के लिए हमें *${item}* चाहिए।`,
    waitingOn: (party, since) => `${since} से ${party} के जवाब का इंतज़ार है। हम बताएँगे।`,
    parties: { customer: 'आपसे', bank: 'आपके बैंक से', discom: 'बिजली बोर्ड से' },
  },
  confirmCancelled: 'अब आपको उस सवाल का जवाब देने की ज़रूरत नहीं है। धन्यवाद।',
  old: 'वह पहले का संदेश था — आपने जो भेजा, हमने नोट कर लिया है।',
};

export const JOURNEY_LISTS = { en: EN_JOURNEY, mr: MR_JOURNEY, hi: HI_JOURNEY };
export const JOURNEY_WORDS = localized(EN_JOURNEY, { mr: MR_JOURNEY, hi: HI_JOURNEY });
