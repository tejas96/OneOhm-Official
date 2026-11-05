import type { Words } from './language';
import type { AssistantWords } from './words';

/**
 * What the WhatsApp assistant says in Marathi: the same shape as the English words.
 * Taps carry the customer around; typed words in any language work too.
 */
export const MR: Words<AssistantWords> = {
  WORDS: {
    menuButton: 'निवडा',
    unknownNumber:
      'नमस्कार! हा नंबर अजून आमच्या कोणत्याही ग्राहकाशी जोडलेला नाही. तुम्हाला सोलरमध्ये रस असेल तर "मला कॉल करा" दाबा. तुम्ही दुसऱ्या नंबरवरून ग्राहक असाल तर कृपया त्या नंबरवरून लिहा.',
    callMeBack: 'मला कॉल करा',
    callbackNoted: 'धन्यवाद! आमच्या टीममधील कोणीतरी लवकरच तुम्हाला कॉल करेल.',
    noProject: 'तुमचा प्रकल्प अजून सुरू झालेला नाही.',
    stage: {
      survey: 'साइट भेट',
      design: 'सिस्टम डिझाइन',
      material: 'साहित्य',
      installation: 'बसवणी',
      commissioning: 'सिस्टम सुरू',
      net_metering: 'नेट मीटर',
      subsidy: 'अनुदान',
    },
    subsidy: {
      not_applicable: 'या प्रकल्पावर अनुदान नाही.',
      pending: 'अनुदान: अजून अर्ज केलेला नाही',
      applied: 'अनुदान: अर्ज केला, सरकारची वाट पाहत आहोत',
      inspected: 'अनुदान: तपासणी झाली, रक्कम जमा होण्याची वाट पाहत आहोत',
      released: 'अनुदान: जमा झाले',
      received: 'अनुदान तुमच्या बँकेत जमा झाले ✅',
      checking: 'अनुदान: आम्ही सरकारकडे चौकशी करत आहोत',
    },
    waitingOn: {
      customer: 'तुमच्याकडून काहीतरी हवे आहे',
      bank: 'बँकेची वाट पाहत आहोत',
      discom: 'वीज मंडळाची (DISCOM) वाट पाहत आहोत',
    },
    payNow: 'आता भरा',
    noDocuments: 'अजून कागदपत्रे नाहीत. प्रकल्प पुढे जाईल तशी ती इथे दिसतील.',
    askProblem:
      'कृपया समस्या एका मेसेजमध्ये सांगा (उदा. "सकाळपासून इन्व्हर्टरवर एरर दिसतो"). फोटोसोबत कॅप्शनही पाठवू शकता.',
    noRequests: 'तुम्ही अजून कोणतीही समस्या सांगितलेली नाही.',
    askReferral:
      'तुमच्या मित्राचे नाव आणि 10 अंकी मोबाईल नंबर एकाच मेसेजमध्ये पाठवा, उदा. "सुरेश पाटील 9876543210".',
    referralKnown: 'या नंबरशी आम्ही आधीच संपर्कात आहोत. आमची आठवण ठेवल्याबद्दल धन्यवाद!',
    referralUnclear: 'आम्हाला नाव आणि 10 अंकी मोबाईल नंबर सापडला नाही. कृपया पुन्हा प्रयत्न करा.',
    referredWelcome: (referrer, company) =>
      `${company ? `${company} मध्ये ` : ''}स्वागत आहे! ${referrer} यांनी तुमचे नाव सुचवले आहे. तुमच्या सोलरचे नियोजन करण्यासाठी आमची टीम लवकरच याच नंबरवर कॉल करेल.`,
    quoteYes: 'हो, स्वीकारतो',
    quoteNotYet: 'आत्ता नाही',
    quoteChanged: 'हे कोटेशन बदलले आहे किंवा आता खुले नाही.',
    quoteOwnerOnly: 'कोटेशन फक्त ग्राहकाच्या स्वतःच्या नंबरवरून स्वीकारता येते.',
  },
  RATINGS: [
    { id: 'rate:5', title: 'खूप खूश', description: '5 पैकी 5' },
    { id: 'rate:4', title: 'खूश', description: '5 पैकी 4' },
    { id: 'rate:3', title: 'ठीक आहे', description: '5 पैकी 3' },
    { id: 'rate:2', title: 'खूश नाही', description: '5 पैकी 2' },
    { id: 'rate:1', title: 'अजिबात खूश नाही', description: '5 पैकी 1' },
  ],
  MEDIA_WORDS: {
    talkToPerson: 'व्यक्तीशी बोला',
    photoAdded: 'धन्यवाद, फोटो तुमच्या समस्येला जोडला आहे.',
    photoNotAdded: 'फाइल तुमच्या समस्येला जोडता आली नाही. कृपया समस्येचा फोटो पाठवा.',
    // Saved as the request's description, which the team reads: kept in English.
    tooLarge: 'ती फाइल खूप मोठी आहे (जास्तीत जास्त 25 MB). कृपया फोटो किंवा PDF पाठवा.',
    wrongType: 'या प्रकारची फाइल आम्ही उघडू शकत नाही. कृपया फोटो किंवा PDF पाठवा.',
    emptyFile: 'ती फाइल रिकामी आहे. कृपया ती पुन्हा पाठवा.',
    failed: 'माफ करा, ती फाइल उघडता आली नाही. कृपया थोड्या वेळाने पुन्हा पाठवा.',
    paperGone: 'तो कागद आता लागत नाही, किंवा आमच्याकडे आधीच आहे. काहीही बदलले नाही.',
    paperAskEnded: 'तुमच्या फाइल आधीच जतन केल्या आहेत. दुसरे काहीही बदलले नाही.',
  },
  COVER_WORDS: {
    notYet: 'तुमची सिस्टम सुरू झाल्याच्या दिवसापासून वॉरंटी सुरू होते. तेव्हा ती इथे दिसेल.',
    since: (date) => `${date} रोजी सुरू झाली. कव्हर त्या दिवसापासून मोजले जाते.`,
    kinds: {
      panel: 'सोलर पॅनल',
      inverter: 'इन्व्हर्टर',
      battery: 'बॅटरी',
      structure: 'माउंटिंग स्ट्रक्चर',
      workmanship: 'बसवणीचे काम',
    },
    item: (kind, length, until) => `• ${kind}: ${length}, ${until} पर्यंत`,
    ended: (kind, until) => `• ${kind}: वॉरंटी ${until} रोजी संपली`,
    performance: (date) => `  वीज निर्मितीची हमी ${date} पर्यंत`,
    years: (count) => (count === 1 ? '1 वर्ष' : `${count} वर्षे`),
    months: (count) => (count === 1 ? '1 महिना' : `${count} महिने`),
    amc: (plan, state, from, to) => `AMC: ${plan} (${state}), ${from} ते ${to}`,
    amcState: { upcoming: 'लवकरच सुरू', active: 'चालू', ended: 'संपले', cancelled: 'रद्द' },
    amcVisits: (done, total) => `${total} पैकी ${done} भेटी झाल्या`,
    nextVisit: (name, date) => `पुढील ${name} भेट: ${date}`,
    noAmc: 'AMC: अजून नाही. वार्षिक स्वच्छता आणि तपासणी भेटींसाठी आम्हाला इथे विचारा.',
    help: 'यापैकी कशातही समस्या असल्यास खाली "समस्या सांगा" दाबा.',
  },
  REWARD_WORDS: {
    none: 'तुम्ही अजून कोणाला सुचवलेले नाही. तुम्ही सुचवलेल्या मित्राचे सोलर बसल्यावर तुम्हाला बक्षीस मिळेल.',
    title: '*तुमचे रेफरल*',
    status: {
      received: 'आम्ही लवकरच त्यांना कॉल करू',
      in_progress: 'आम्ही त्यांच्याशी बोलत आहोत',
      ordered: 'त्यांनी सोलर ऑर्डर केले',
      installed: 'त्यांचे सोलर बसले आहे',
      closed: 'पुढे गेले नाही',
    },
    reward: {
      pending: (amount) => `बक्षीस ${amount}, मंजुरीची वाट`,
      approved: (amount) => `बक्षीस ${amount}, मंजूर, लवकरच मिळेल`,
      paid: (amount, date) => `बक्षीस ${amount}, दिले${date ? ` (${date})` : ''}`,
      rejected: (_amount) => 'यावर बक्षीस नाही',
    },
    paidTotal: (amount) => `तुम्हाला दिले: ${amount}`,
    comingTotal: (amount) => `येणारे: ${amount}`,
    more: (count) => `आणखी ${count}.`,
  },
  FEEDBACK_WORDS: {
    later: 'धन्यवाद! तुमची सोलर सिस्टम सुरू झाल्यावर आम्ही तुमचे रेटिंग विचारू.',
  },
  ANSWER_WORDS: {
    allDone: (steps) => `सर्व ${steps} टप्पे पूर्ण. तुमची सोलर सिस्टम पूर्ण झाली आहे.`,
    next: (title, when) => `पुढे: ${title}, ${when} रोजी नियोजित`,
    waitingSince: (who, when) => `${when} पासून ${who}`,
    home: (home, size) => `*तुमचे ${home} येथील सोलर* · ${size}`,
    total: (home, total) => `*${home} सोलर* — एकूण ${total}`,
    paid: (amount) => `✅ ${amount} भरले`,
    bank: (amount) => `⚪ ${amount} बँक कर्जातून`,
    later: (amount, when) => `⚪ ${when} ${amount}`,
    due: (amount) => `🔴 *${amount} आता भरायचे*`,
    requestStatus: { open: 'मिळाली', in_progress: 'काम चालू आहे', resolved: 'सोडवली' },
    technicianVisit: (when) => `तंत्रज्ञ भेट: ${when}`,
  },
  CATEGORY_WORDS: {
    inverter_error: 'इन्व्हर्टर',
    no_generation: 'वीज निर्मिती बंद',
    low_generation: 'कमी वीज निर्मिती',
    physical_damage: 'नुकसान',
    cleaning: 'स्वच्छता',
    billing_net_meter: 'बिल किंवा मीटर',
    subsidy: 'अनुदान',
    other: 'सेवा',
  },
};
