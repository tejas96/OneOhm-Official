import type { Words } from './language';
import type { AssistantWords } from './words';

/**
 * What the WhatsApp assistant says in Marathi: the same shape as the English words.
 * "menu", "requests" and "skip" stay as typed keywords, so they work in every language.
 */
export const MR: Words<AssistantWords> = {
  MENU_ROWS: [
    { id: 'progress', title: 'प्रकल्पाची प्रगती', description: 'तुमचे सोलर काम कुठपर्यंत आले' },
    { id: 'payments', title: 'पेमेंट', description: 'भरलेले, बाकी आणि पेमेंट लिंक' },
    { id: 'documents', title: 'कागदपत्रे', description: 'कोटेशन, बिले, पावत्या, कागद' },
    { id: 'service', title: 'तक्रार नोंदवा', description: 'सेवा विनंती नोंदवा' },
    { id: 'requests', title: 'माझ्या विनंत्या', description: 'सेवा विनंत्यांची स्थिती' },
    { id: 'warranty', title: 'वॉरंटी आणि AMC', description: 'तुमची उपकरणे आणि कव्हर' },
    { id: 'refer', title: 'मित्राला सुचवा', description: 'मित्रांना सांगा, बक्षीस मिळवा' },
    { id: 'rewards', title: 'माझी बक्षिसे', description: 'तुमचे रेफरल आणि बक्षिसे' },
    { id: 'feedback', title: 'रेटिंग द्या', description: 'आमचे काम कसे वाटले ते सांगा' },
    { id: 'human', title: 'व्यक्तीशी बोला', description: 'टीममधील कोणीतरी इथे उत्तर देईल' },
  ],
  WORDS: {
    menu: (name, company) =>
      `नमस्कार ${name}! मी ${company ? `${company} चा ` : ''}सहाय्यक आहे. तुम्हाला काय पाहायचे आहे? कधीही "menu" लिहा.`,
    menuButton: 'निवडा',
    unknownNumber:
      'नमस्कार! हा नंबर अजून आमच्या कोणत्याही ग्राहकाशी जोडलेला नाही. तुम्हाला सोलरमध्ये रस असेल तर "मला कॉल करा" दाबा. तुम्ही दुसऱ्या नंबरवरून ग्राहक असाल तर कृपया त्या नंबरवरून लिहा.',
    callMeBack: 'मला कॉल करा',
    callbackNoted: 'धन्यवाद! आमच्या टीममधील कोणीतरी लवकरच तुम्हाला कॉल करेल.',
    noProject: 'तुमचा प्रकल्प अजून सुरू झालेला नाही. आमच्याशी बोलण्यासाठी मेनूमध्ये "व्यक्तीशी बोला" दाबा.',
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
      released: 'अनुदान: जमा झाले',
    },
    waitingOn: {
      customer: 'तुमच्याकडून काहीतरी हवे आहे',
      bank: 'बँकेची वाट पाहत आहोत',
      discom: 'वीज मंडळाची (DISCOM) वाट पाहत आहोत',
    },
    allPaid: 'सर्व पेमेंट झाले आहे. धन्यवाद!',
    payHere: 'इथे भरा',
    payNow: 'आता भरा',
    noDocuments: 'अजून कागदपत्रे नाहीत. प्रकल्प पुढे जाईल तशी ती इथे दिसतील.',
    linksExpire: (hours) => `लिंक ${hours} तास चालतील.`,
    askProblem:
      'कृपया समस्या एका मेसेजमध्ये सांगा (उदा. "सकाळपासून इन्व्हर्टरवर एरर दिसतो"). फोटोसोबत कॅप्शनही पाठवू शकता.',
    problemSaved: (category) =>
      `धन्यवाद. तुमची ${category} विनंती नोंदवली आहे. आमची टीम तुम्हाला कॉल करेल. स्थिती पाहण्यासाठी "requests" लिहा.`,
    tooShort: 'कृपया आणखी काही शब्द लिहा, म्हणजे आम्ही मदत करू शकू.',
    noRequests: 'तुमच्या कोणत्याही सेवा विनंत्या नाहीत.',
    askReferral:
      'तुमच्या मित्राचे नाव आणि 10 अंकी मोबाईल नंबर एकाच मेसेजमध्ये पाठवा, उदा. "सुरेश पाटील 9876543210".',
    referralSaved: (name) =>
      `धन्यवाद! आम्ही ${name} यांना कॉल करू. त्यांचे सोलर बसल्यावर तुम्हाला बक्षीस मिळेल.`,
    referralUnclear: 'नाव आणि 10 अंकी मोबाईल नंबर सापडला नाही. कृपया पुन्हा प्रयत्न करा.',
    referredWelcome: (referrer, company) =>
      `${company ? `${company} मध्ये ` : ''}स्वागत आहे! ${referrer} यांनी तुमचे नाव सुचवले आहे. तुमच्या सोलरचे नियोजन करण्यासाठी आमची टीम लवकरच याच नंबरवर कॉल करेल.`,
    askRating: 'आतापर्यंत तुम्ही आमच्यावर किती खूश आहात?',
    ratingSaved: 'रेटिंगसाठी धन्यवाद! त्यामुळे टीमला मदत होते.',
    humanSoon:
      'टीममधील कोणीतरी लवकरच इथे उत्तर देईल (सोमवार ते शनिवार, सकाळी 9:30 ते संध्याकाळी 6:30). सहाय्यकाकडे परत जाण्यासाठी "menu" लिहा.',
    notUnderstood: 'माफ करा, मला समजले नाही. मी यात मदत करू शकतो:',
    passedToOwner: (name) => `धन्यवाद. ${name ?? 'आमची टीम'} तुम्हाला इथेच उत्तर देईल.`,
    nightReply: (name) =>
      `धन्यवाद. आम्ही सकाळी 9:30 ते संध्याकाळी 6:30 उत्तर देतो. तुमचा मेसेज ${name ? `${name} यांच्याकडे` : 'आमच्या टीमकडे'} आहे.`,
    quoteConfirm: (number, total) => `कोटेशन ${number} (${total}) स्वीकारायचे?`,
    quoteYes: 'हो, स्वीकारतो',
    quoteNotYet: 'आत्ता नाही',
    quoteChanged: 'हे कोटेशन बदलले आहे किंवा आता खुले नाही.',
    quoteOwnerOnly: 'कोटेशन फक्त ग्राहकाच्या स्वतःच्या नंबरवरून स्वीकारता येते.',
    quoteThanks: 'धन्यवाद. आमची टीम तुमचा प्रकल्प सुरू करेल आणि आगाऊ रकमेची पेमेंट लिंक पाठवेल.',
  },
  RATINGS: [
    { id: 'rate:5', title: 'खूप खूश', description: '5 पैकी 5' },
    { id: 'rate:4', title: 'खूश', description: '5 पैकी 4' },
    { id: 'rate:3', title: 'ठीक आहे', description: '5 पैकी 3' },
    { id: 'rate:2', title: 'खूश नाही', description: '5 पैकी 2' },
    { id: 'rate:1', title: 'अजिबात खूश नाही', description: '5 पैकी 1' },
  ],
  FILE_WORDS: {
    quotation: (number, url) => `कोटेशन ${number}: ${url}`,
    invoice: (number, amount, url) => `टॅक्स इनव्हॉइस ${number} (${amount}): ${url}`,
    receipt: (number, amount, url) => `पावती ${number} (${amount}): ${url}`,
    report: (name, code, url) => `${name} (${code}): ${url}`,
    paper: (name, url) => `${name}: ${url}`,
    more: 'आणखी कागदपत्रे OneOhm ॲपमध्ये आहेत.',
  },
  MEDIA_WORDS: {
    what: { image: 'फोटो', document: 'कागद', video: 'व्हिडिओ', audio: 'व्हॉइस नोट' },
    ask: (what) => `धन्यवाद, तुमचा ${what} मिळाला. हा तुमच्या सोलर सिस्टममधील समस्येबद्दल आहे का?`,
    reportProblem: 'तक्रार नोंदवा',
    talkToPerson: 'व्यक्तीशी बोला',
    paperSaved: (title) =>
      `धन्यवाद! तुमचे ${title} मिळाले. ते तुमच्या कागदपत्रांसोबत ठेवले आहे आणि टीमला कळवले आहे.`,
    stillNeed: (titles) => `अजून हवे आहे: ${titles}. मिळाल्यावर इथे पाठवा.`,
    paperRefused: (title) =>
      `माफ करा, ही फाइल तुमच्या ${title} साठी वापरता आली नाही. कृपया स्पष्ट फोटो किंवा PDF पाठवा.`,
    photoAdded: 'धन्यवाद, फोटो तुमच्या विनंतीला जोडला आहे.',
    photoNotAdded: 'फाइल विनंतीला जोडता आली नाही. कृपया समस्येचा फोटो पाठवा.',
    // Saved as the request's description, which the team reads: kept in English.
    photoOnly: 'Photo or paper sent on WhatsApp.',
    notRead:
      'माफ करा, इथे फक्त फोटो आणि PDF कागद घेता येतात. कृपया थोडक्यात लिहा, किंवा "menu" लिहून "व्यक्तीशी बोला" दाबा.',
    tooLarge: 'ही फाइल खूप मोठी आहे. कृपया लहान फोटो किंवा PDF पाठवा.',
    failed: 'माफ करा, ती फाइल उघडता आली नाही. कृपया थोड्या वेळाने पुन्हा पाठवा.',
    problemSavedWithPhotos: (category, photos) =>
      `धन्यवाद. तुमची ${category} विनंती ${photos === 1 ? 'फोटोसह' : `${photos} फोटोंसह`} नोंदवली आहे. आमची टीम तुम्हाला कॉल करेल. स्थिती पाहण्यासाठी "requests" लिहा.`,
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
    noAmc: 'AMC: अजून नाही. वार्षिक स्वच्छता आणि तपासणी भेटींसाठी "menu" लिहून "व्यक्तीशी बोला" दाबा.',
    help: 'यापैकी कशातही समस्या असल्यास मेनूमध्ये "तक्रार नोंदवा" दाबा.',
  },
  REWARD_WORDS: {
    none: 'तुम्ही अजून कोणाला सुचवलेले नाही. मित्रांना आमच्याबद्दल सांगण्यासाठी "मित्राला सुचवा" दाबा. त्यांचे सोलर बसल्यावर तुम्हाला बक्षीस मिळेल.',
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
    more: (count) => `आणखी ${count} OneOhm ॲपमध्ये.`,
  },
  FEEDBACK_WORDS: {
    later:
      'धन्यवाद! तुमची सोलर सिस्टम सुरू झाल्यावर आम्ही तुमचे रेटिंग विचारू. इतर पर्याय पाहण्यासाठी "menu" लिहा.',
    askComment: 'रेटिंगसाठी धन्यवाद! आणखी काही सांगायचे आहे? इथे लिहा, किंवा "skip" लिहा.',
    commentSaved: 'धन्यवाद, आम्ही नोंद घेतली. त्यामुळे टीमला अधिक चांगले काम करता येते.',
    skipWords: ['skip', 'no', 'nahi', 'nako', 'नाही', 'नको', 'काही नाही'],
  },
  ANSWER_WORDS: {
    now: (stage, done, steps) => `आता: ${stage} (${steps} पैकी ${done} टप्पे पूर्ण)`,
    next: (title, when) => `पुढे: ${title}, ${when} रोजी नियोजित`,
    waitingSince: (who, when) => `${when} पासून ${who}`,
    paid: (label, amount) => `✓ ${label}: ${amount} भरले`,
    bank: (label, amount) => `• ${label}: ${amount} (बँक कर्ज)`,
    later: (label, amount) => `• ${label}: ${amount} नंतर`,
    due: (label, amount) => `• ${label}: ${amount} बाकी`,
    requestStatus: { open: 'नवीन', in_progress: 'काम चालू आहे', resolved: 'सोडवली' },
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
