import type { Words } from './language';
import type { AssistantWords } from './words';

/**
 * What the WhatsApp assistant says in Hindi: the same shape as the English words.
 * Taps carry the customer around; typed words in any language work too.
 */
export const HI: Words<AssistantWords> = {
  MENU_ROWS: [
    { id: 'progress', title: 'प्रोजेक्ट की प्रगति', description: 'आपका सोलर काम कहाँ तक पहुँचा' },
    { id: 'payments', title: 'भुगतान', description: 'भरा हुआ, बाकी और भुगतान लिंक' },
    { id: 'documents', title: 'दस्तावेज़', description: 'कोटेशन, इनवॉइस, रसीदें, कागज़' },
    { id: 'service', title: 'शिकायत दर्ज करें', description: 'सर्विस अनुरोध दर्ज करें' },
    { id: 'requests', title: 'मेरे अनुरोध', description: 'सर्विस अनुरोधों की स्थिति' },
    { id: 'warranty', title: 'वारंटी और AMC', description: 'आपके उपकरण और कवर' },
    { id: 'refer', title: 'दोस्त को सुझाएँ', description: 'दोस्तों को बताएँ, इनाम पाएँ' },
    { id: 'rewards', title: 'मेरे इनाम', description: 'आपके रेफ़रल और इनाम' },
    { id: 'feedback', title: 'रेटिंग दें', description: 'बताएँ हमारा काम कैसा रहा' },
    { id: 'human', title: 'टीम से बात करें', description: 'टीम का कोई सदस्य यहाँ जवाब देगा' },
  ],
  WORDS: {
    menu: (name, company) =>
      `नमस्ते ${name}! मैं ${company ? `${company} का ` : ''}सहायक हूँ। आप क्या देखना चाहेंगे?`,
    menuButton: 'चुनें',
    unknownNumber:
      'नमस्ते! यह नंबर अभी हमारे किसी ग्राहक से जुड़ा नहीं है। अगर आप सोलर में रुचि रखते हैं, तो "मुझे कॉल करें" दबाएँ। अगर आप किसी दूसरे नंबर से ग्राहक हैं, तो कृपया उसी नंबर से लिखें।',
    callMeBack: 'मुझे कॉल करें',
    callbackNoted: 'धन्यवाद! हमारी टीम का कोई सदस्य जल्द ही आपको कॉल करेगा।',
    noProject: 'आपका प्रोजेक्ट अभी शुरू नहीं हुआ है। हमसे बात करने के लिए "हमसे बात करें" दबाएँ।',
    stage: {
      survey: 'साइट विज़िट',
      design: 'सिस्टम डिज़ाइन',
      material: 'सामान',
      installation: 'इंस्टॉलेशन',
      commissioning: 'सिस्टम चालू',
      net_metering: 'नेट मीटर',
      subsidy: 'सब्सिडी',
    },
    subsidy: {
      not_applicable: 'इस प्रोजेक्ट पर सब्सिडी नहीं है।',
      pending: 'सब्सिडी: अभी आवेदन नहीं हुआ',
      applied: 'सब्सिडी: आवेदन हो गया, सरकार का इंतज़ार',
      released: 'सब्सिडी: जारी हो गई',
    },
    waitingOn: {
      customer: 'आपसे कुछ चाहिए',
      bank: 'बैंक का इंतज़ार',
      discom: 'बिजली बोर्ड (DISCOM) का इंतज़ार',
    },
    allPaid: 'सारा भुगतान हो गया है। धन्यवाद!',
    payHere: 'यहाँ भुगतान करें',
    payNow: 'अभी भुगतान करें',
    noDocuments: 'अभी कोई दस्तावेज़ नहीं हैं। प्रोजेक्ट आगे बढ़ने पर वे यहाँ दिखेंगे।',
    askProblem:
      'कृपया समस्या एक मैसेज में बताएँ (जैसे "सुबह से इन्वर्टर पर एरर दिख रहा है")। फ़ोटो के साथ कैप्शन भी भेज सकते हैं।',
    problemSaved: (category) =>
      `धन्यवाद। आपका ${category} अनुरोध दर्ज हो गया है। हमारी टीम आपको कॉल करेगी। स्थिति देखने के लिए "मेरे अनुरोध" दबाएँ।`,
    tooShort: 'कृपया कुछ और शब्द लिखें, ताकि हम मदद कर सकें।',
    noRequests: 'आपका कोई सर्विस अनुरोध नहीं है।',
    askReferral:
      'अपने दोस्त का नाम और 10 अंकों का मोबाइल नंबर एक ही मैसेज में भेजें, जैसे "सुरेश पाटिल 9876543210"।',
    referralSaved: (name) => `धन्यवाद! हम ${name} को कॉल करेंगे। उनका सोलर लगने पर आपको इनाम मिलेगा।`,
    referralKnown: 'इस नंबर से हम पहले से संपर्क में हैं। हमें याद रखने के लिए धन्यवाद!',
    referralUnclear: 'नाम और 10 अंकों का मोबाइल नंबर नहीं मिला। कृपया फिर से कोशिश करें।',
    referredWelcome: (referrer, company) =>
      `${company ? `${company} में ` : ''}आपका स्वागत है! ${referrer} ने आपका नाम सुझाया है। आपके सोलर की योजना बनाने के लिए हमारी टीम जल्द ही इसी नंबर पर कॉल करेगी।`,
    askRating: 'अब तक आप हमसे कितने खुश हैं?',
    ratingSaved: 'रेटिंग के लिए धन्यवाद! इससे टीम को मदद मिलती है।',
    humanSoon:
      'टीम का कोई सदस्य जल्द ही यहाँ जवाब देगा (सोमवार से शनिवार, सुबह 9:30 से शाम 6:30)। सहायक पर वापस जाने के लिए "मेनू" दबाएँ।',
    notUnderstood: 'माफ़ कीजिए, मैं समझ नहीं पाया। मैं इनमें मदद कर सकता हूँ:',
    passedToOwner: (name) =>
      name ? `धन्यवाद। ${name} आपको यहीं जवाब देंगे।` : 'धन्यवाद। हमारी टीम आपको यहीं जवाब देगी।',
    nightReply: (name) =>
      `धन्यवाद। हम सुबह 9:30 से शाम 6:30 तक जवाब देते हैं। आपका मैसेज ${name ? `${name} के पास` : 'हमारी टीम के पास'} है।`,
    quoteYes: 'हाँ, स्वीकार है',
    quoteNotYet: 'अभी नहीं',
    quoteChanged: 'यह कोटेशन बदल गया है या अब खुला नहीं है।',
    quoteOwnerOnly: 'कोटेशन सिर्फ़ ग्राहक के अपने नंबर से स्वीकार हो सकता है।',
  },
  RATINGS: [
    { id: 'rate:5', title: 'बहुत खुश', description: '5 में से 5' },
    { id: 'rate:4', title: 'खुश', description: '5 में से 4' },
    { id: 'rate:3', title: 'ठीक है', description: '5 में से 3' },
    { id: 'rate:2', title: 'खुश नहीं', description: '5 में से 2' },
    { id: 'rate:1', title: 'बिल्कुल खुश नहीं', description: '5 में से 1' },
  ],
  MEDIA_WORDS: {
    what: { image: 'फ़ोटो', document: 'कागज़', video: 'वीडियो', audio: 'वॉइस नोट' },
    ask: (what) => `धन्यवाद, आपका ${what} मिल गया। क्या यह आपके सोलर सिस्टम की किसी समस्या के बारे में है?`,
    reportProblem: 'शिकायत दर्ज करें',
    talkToPerson: 'टीम से बात करें',
    paperSaved: (title) =>
      `धन्यवाद! आपका ${title} मिल गया। इसे आपके दस्तावेज़ों के साथ रखा गया है और टीम को बता दिया गया है।`,
    stillNeed: (titles) => `अभी भी चाहिए: ${titles}। मिलने पर यहाँ भेजें।`,
    paperRefused: (title) =>
      `माफ़ कीजिए, यह फ़ाइल आपके ${title} के लिए इस्तेमाल नहीं हो सकी। कृपया साफ़ फ़ोटो या PDF भेजें।`,
    photoAdded: 'धन्यवाद, फ़ोटो आपके अनुरोध में जोड़ दी गई है।',
    photoNotAdded: 'फ़ाइल अनुरोध में नहीं जुड़ सकी। कृपया समस्या की फ़ोटो भेजें।',
    // Saved as the request's description, which the team reads: kept in English.
    photoOnly: 'Photo or paper sent on WhatsApp.',
    tooLarge: 'यह फ़ाइल बहुत बड़ी है। कृपया छोटी फ़ोटो या PDF भेजें।',
    failed: 'माफ़ कीजिए, वह फ़ाइल खुल नहीं सकी। कृपया थोड़ी देर बाद फिर से भेजें।',
    problemSavedWithPhotos: (category, photos) =>
      `धन्यवाद। आपका ${category} अनुरोध ${photos === 1 ? 'फ़ोटो के साथ' : `${photos} फ़ोटो के साथ`} दर्ज हो गया है। हमारी टीम आपको कॉल करेगी। स्थिति देखने के लिए "मेरे अनुरोध" दबाएँ।`,
  },
  COVER_WORDS: {
    notYet: 'आपकी वारंटी उस दिन से शुरू होती है जिस दिन सिस्टम चालू होता है। तब यह यहाँ दिखेगी।',
    since: (date) => `${date} को चालू हुआ। कवर उसी दिन से गिना जाता है।`,
    kinds: {
      panel: 'सोलर पैनल',
      inverter: 'इन्वर्टर',
      battery: 'बैटरी',
      structure: 'माउंटिंग स्ट्रक्चर',
      workmanship: 'इंस्टॉलेशन का काम',
    },
    item: (kind, length, until) => `• ${kind}: ${length}, ${until} तक`,
    ended: (kind, until) => `• ${kind}: वारंटी ${until} को खत्म हुई`,
    performance: (date) => `  बिजली उत्पादन की गारंटी ${date} तक`,
    years: (count) => (count === 1 ? '1 साल' : `${count} साल`),
    months: (count) => (count === 1 ? '1 महीना' : `${count} महीने`),
    amc: (plan, state, from, to) => `AMC: ${plan} (${state}), ${from} से ${to}`,
    amcState: { upcoming: 'जल्द शुरू', active: 'चालू', ended: 'खत्म', cancelled: 'रद्द' },
    amcVisits: (done, total) => `${total} में से ${done} विज़िट हुईं`,
    nextVisit: (name, date) => `अगली ${name} विज़िट: ${date}`,
    noAmc: 'AMC: अभी नहीं। सालाना सफ़ाई और जाँच विज़िट के लिए "हमसे बात करें" दबाएँ।',
    help: 'इनमें से किसी में भी समस्या हो, तो मेनू में "शिकायत दर्ज करें" दबाएँ।',
  },
  REWARD_WORDS: {
    none: 'आपने अभी तक किसी को नहीं सुझाया है। दोस्तों को हमारे बारे में बताने के लिए "दोस्त को सुझाएँ" दबाएँ। उनका सोलर लगने पर आपको इनाम मिलेगा।',
    title: '*आपके रेफ़रल*',
    status: {
      received: 'हम जल्द ही उन्हें कॉल करेंगे',
      in_progress: 'हम उनसे बात कर रहे हैं',
      ordered: 'उन्होंने सोलर ऑर्डर किया',
      installed: 'उनका सोलर लग गया है',
      closed: 'आगे नहीं बढ़े',
    },
    reward: {
      pending: (amount) => `इनाम ${amount}, मंज़ूरी का इंतज़ार`,
      approved: (amount) => `इनाम ${amount}, मंज़ूर, जल्द मिलेगा`,
      paid: (amount, date) => `इनाम ${amount}, दिया गया${date ? ` (${date})` : ''}`,
      rejected: (_amount) => 'इस पर इनाम नहीं',
    },
    paidTotal: (amount) => `आपको दिया गया: ${amount}`,
    comingTotal: (amount) => `आने वाला: ${amount}`,
    more: (count) => `और ${count}।`,
  },
  FEEDBACK_WORDS: {
    later: 'धन्यवाद! आपका सोलर सिस्टम चालू होने पर हम आपकी रेटिंग पूछेंगे।',
    askComment: 'रेटिंग के लिए धन्यवाद! कुछ और कहना है? यहाँ लिखें, या "मेनू" दबाएँ।',
    commentSaved: 'धन्यवाद, हमने इसे नोट कर लिया है। इससे टीम को और बेहतर काम करने में मदद मिलती है।',
    skipWords: ['skip', 'no', 'nahi', 'नहीं', 'नही', 'कुछ नहीं'],
  },
  ANSWER_WORDS: {
    now: (stage, done, steps) => `अभी: ${stage} (${steps} में से ${done} चरण पूरे)`,
    next: (title, when) => `आगे: ${title}, ${when} को तय`,
    waitingSince: (who, when) => `${when} से ${who}`,
    paid: (label, amount) => `✓ ${label}: ${amount} भरा`,
    bank: (label, amount) => `• ${label}: ${amount} (बैंक लोन)`,
    later: (label, amount) => `• ${label}: ${amount} बाद में`,
    due: (label, amount) => `• ${label}: ${amount} बाकी`,
    requestStatus: { open: 'नया', in_progress: 'काम चल रहा है', resolved: 'हल हो गया' },
    technicianVisit: (when) => `टेक्नीशियन विज़िट: ${when}`,
  },
  CATEGORY_WORDS: {
    inverter_error: 'इन्वर्टर',
    no_generation: 'बिजली उत्पादन बंद',
    low_generation: 'कम बिजली उत्पादन',
    physical_damage: 'नुकसान',
    cleaning: 'सफ़ाई',
    billing_net_meter: 'बिल या मीटर',
    subsidy: 'सब्सिडी',
    other: 'सर्विस',
  },
};
