import { localized, type Words } from '../whatsapp/assistant/language';

/**
 * What the customer reads for the subsidy, bank and layout questions (redesign §4, §18 11, 15):
 * "we" voice, English, Marathi and Hindi. Buttons keep 20 characters (step-words.test.ts checks all three).
 */
const EN_STEPS = {
  buttons: {
    done: 'Done',
    needHelp: 'Need help',
    received: 'Yes, received',
    notYet: 'Not yet',
    arrived: 'It has arrived',
    going: "I'll go",
    changeDay: 'Change day',
    looksGood: 'Looks good',
    question: 'I have a question',
  },
  register: {
    ask: (home: string) =>
      `Please register on the PM Surya Ghar portal for your *${home}* solar. It takes 5 minutes. Keep your latest electricity bill ready (consumer number, electricity company) and an email ID:\n1. Open pmsuryaghar.gov.in\n2. Register with your mobile number and electricity consumer number\n3. Tap Done here when you finish`,
    line: (home: string) => `Please register on the PM Surya Ghar portal for your *${home}* solar.`,
    done: 'Thank you ✅ We have noted that you registered. We will take the next step.',
    help: 'We will help you with the registration.',
    what: 'the PM Surya Ghar registration',
    cancelled: 'You do not need to register on the PM Surya Ghar portal for now. Thank you.',
  },
  credit: {
    ask: (amount: string, home: string) =>
      `Did the *${amount}* subsidy for ${home} reach your bank account?`,
    yes: 'Thank you ✅ We are glad the subsidy reached you.',
    notYet: 'No problem — we have noted it. Tap the button when the money arrives.',
    what: 'the subsidy question',
    cancelled: 'You do not need to tell us about the subsidy any more. Thank you.',
  },
  bank: {
    ask: (bank: string, branch: string, day: string) =>
      `Please visit *${bank}, ${branch}* on *${day}* to sign the loan papers.`,
    going: (day: string) => `Thank you ✅ We have noted that you will go on ${day}.`,
    change: 'No problem — we have told our team. They will contact you to fix a new day.',
    what: 'the visit to the bank',
    cancelled:
      'You do not need to visit the bank on that day any more. We will tell you the new plan.',
  },
  layout: {
    ask: (home: string) => `Here is how the panels will sit on your *${home}* roof.`,
    ok: 'Thank you ✅ We have noted that you are happy with the layout.',
    what: 'the panel layout',
    cancelled: 'You do not need to look at that layout any more. Thank you.',
  },
  loan: {
    sanctioned: (amount: string, bank: string) =>
      `Good news: your loan of *${amount}* is sanctioned by ${bank}.`,
    disbursed: (amount: string, bank: string) => `*${amount}* was sent by ${bank} for your solar.`,
    rejected: (bank: string, name: string) =>
      `${bank} did not approve the loan. ${name} will call you to plan the next steps.`,
  },
  nouns: {
    register: 'your PM Surya Ghar registration',
    credit: 'your subsidy answer',
    bank: 'your visit to the bank',
    layout: 'your panel layout',
  },
};

const MR_STEPS: Words<typeof EN_STEPS> = {
  buttons: {
    done: 'झाले',
    needHelp: 'मदत हवी',
    received: 'हो, मिळाले',
    notYet: 'अजून नाही',
    arrived: 'आता मिळाले',
    going: 'मी जाईन',
    changeDay: 'दिवस बदला',
    looksGood: 'छान आहे',
    question: 'मला प्रश्न आहे',
  },
  register: {
    ask: (home) =>
      `कृपया तुमच्या *${home}* सोलरसाठी पीएम सूर्य घर पोर्टलवर नोंदणी करा. यास ५ मिनिटे लागतात. तुमचे ताजे वीज बिल (ग्राहक क्रमांक, वीज कंपनी) आणि ईमेल आयडी जवळ ठेवा:\n1. pmsuryaghar.gov.in उघडा\n2. तुमचा मोबाइल नंबर आणि वीज ग्राहक क्रमांक वापरून नोंदणी करा\n3. झाल्यावर इथे झाले दाबा`,
    line: (home) => `कृपया तुमच्या *${home}* सोलरसाठी पीएम सूर्य घर पोर्टलवर नोंदणी करा.`,
    done: 'धन्यवाद ✅ तुम्ही नोंदणी केल्याची आम्ही नोंद केली. आम्ही पुढचे पाऊल उचलू.',
    help: 'नोंदणीसाठी आम्ही तुम्हाला मदत करू.',
    what: 'पीएम सूर्य घर नोंदणी',
    cancelled: 'सध्या पीएम सूर्य घर पोर्टलवर नोंदणी करण्याची गरज नाही. धन्यवाद.',
  },
  credit: {
    ask: (amount, home) => `${home} साठीची *${amount}* सबसिडी तुमच्या बँक खात्यात जमा झाली का?`,
    yes: 'धन्यवाद ✅ सबसिडी मिळाल्याचा आम्हाला आनंद आहे.',
    notYet: 'काही हरकत नाही — नोंद केली. पैसे आल्यावर बटण दाबा.',
    what: 'सबसिडीबद्दलचा प्रश्न',
    cancelled: 'सबसिडीबद्दल सांगण्याची आता गरज नाही. धन्यवाद.',
  },
  bank: {
    ask: (bank, branch, day) =>
      `कृपया *${day}* रोजी *${bank}, ${branch}* येथे जाऊन कर्जाच्या कागदपत्रांवर सही करा.`,
    going: (day) => `धन्यवाद ✅ तुम्ही ${day} रोजी जाणार असल्याची नोंद केली.`,
    change: 'काही हरकत नाही — आमच्या टीमला कळवले आहे. ते नवीन दिवस ठरवण्यासाठी तुमच्याशी संपर्क करतील.',
    what: 'बँकेतील भेट',
    cancelled: 'त्या दिवशी बँकेत जाण्याची आता गरज नाही. नवीन योजना आम्ही कळवू.',
  },
  layout: {
    ask: (home) => `तुमच्या *${home}* छतावर पॅनेल कसे बसतील ते हे आहे.`,
    ok: 'धन्यवाद ✅ आराखडा आवडल्याची आम्ही नोंद केली.',
    what: 'पॅनेल आराखडा',
    cancelled: 'तो आराखडा पाहण्याची आता गरज नाही. धन्यवाद.',
  },
  loan: {
    sanctioned: (amount, bank) => `खुशखबर: तुमचे *${amount}* चे कर्ज ${bank} ने मंजूर केले आहे.`,
    disbursed: (amount, bank) => `तुमच्या सोलरसाठी ${bank} कडून *${amount}* पाठवले गेले.`,
    rejected: (bank, name) => `${bank} ने कर्ज मंजूर केले नाही. पुढच्या योजनेसाठी ${name} तुम्हाला फोन करतील.`,
  },
  nouns: {
    register: 'तुमची पीएम सूर्य घर नोंदणी',
    credit: 'सबसिडीबद्दलचे तुमचे उत्तर',
    bank: 'बँकेतील तुमची भेट',
    layout: 'तुमचा पॅनेल आराखडा',
  },
};

const HI_STEPS: Words<typeof EN_STEPS> = {
  buttons: {
    done: 'हो गया',
    needHelp: 'मदद चाहिए',
    received: 'हाँ, मिल गई',
    notYet: 'अभी नहीं',
    arrived: 'अब आ गई',
    going: 'मैं जाऊँगा',
    changeDay: 'दिन बदलें',
    looksGood: 'ठीक है',
    question: 'मेरा सवाल है',
  },
  register: {
    ask: (home) =>
      `कृपया अपने *${home}* सोलर के लिए पीएम सूर्य घर पोर्टल पर रजिस्टर करें। इसमें 5 मिनट लगते हैं। अपना ताज़ा बिजली बिल (उपभोक्ता नंबर, बिजली कंपनी) और ईमेल आईडी पास रखें:\n1. pmsuryaghar.gov.in खोलें\n2. अपने मोबाइल नंबर और बिजली उपभोक्ता नंबर से रजिस्टर करें\n3. पूरा होने पर यहाँ हो गया दबाएँ`,
    line: (home) => `कृपया अपने *${home}* सोलर के लिए पीएम सूर्य घर पोर्टल पर रजिस्टर करें।`,
    done: 'धन्यवाद ✅ आपका रजिस्ट्रेशन हमने दर्ज कर लिया। हम अगला कदम उठाएँगे।',
    help: 'रजिस्ट्रेशन में हम आपकी मदद करेंगे।',
    what: 'पीएम सूर्य घर रजिस्ट्रेशन',
    cancelled: 'अभी पीएम सूर्य घर पोर्टल पर रजिस्टर करने की ज़रूरत नहीं है। धन्यवाद।',
  },
  credit: {
    ask: (amount, home) => `क्या ${home} की *${amount}* सब्सिडी आपके बैंक खाते में आ गई?`,
    yes: 'धन्यवाद ✅ सब्सिडी मिल गई, यह जानकर खुशी हुई।',
    notYet: 'कोई बात नहीं — हमने दर्ज कर लिया। पैसे आने पर बटन दबाएँ।',
    what: 'सब्सिडी का सवाल',
    cancelled: 'अब आपको सब्सिडी के बारे में बताने की ज़रूरत नहीं है। धन्यवाद।',
  },
  bank: {
    ask: (bank, branch, day) =>
      `कृपया *${day}* को *${bank}, ${branch}* जाकर लोन के कागज़ों पर हस्ताक्षर करें।`,
    going: (day) => `धन्यवाद ✅ आप ${day} को जाएँगे, यह हमने दर्ज कर लिया।`,
    change: 'कोई बात नहीं — हमने अपनी टीम को बता दिया है। वे नया दिन तय करने के लिए आपसे संपर्क करेंगे।',
    what: 'बैंक की मुलाकात',
    cancelled: 'उस दिन बैंक जाने की अब ज़रूरत नहीं है। नई योजना हम बताएँगे।',
  },
  layout: {
    ask: (home) => `आपके *${home}* की छत पर पैनल ऐसे लगेंगे।`,
    ok: 'धन्यवाद ✅ लेआउट पसंद आया, यह हमने दर्ज कर लिया।',
    what: 'पैनल लेआउट',
    cancelled: 'अब उस लेआउट को देखने की ज़रूरत नहीं है। धन्यवाद।',
  },
  loan: {
    sanctioned: (amount, bank) => `खुशखबरी: आपका *${amount}* का लोन ${bank} ने स्वीकृत कर दिया है।`,
    disbursed: (amount, bank) => `आपके सोलर के लिए ${bank} की ओर से *${amount}* भेजे गए हैं।`,
    rejected: (bank, name) =>
      `${bank} ने लोन स्वीकृत नहीं किया। आगे की योजना के लिए ${name} आपको फ़ोन करेंगे।`,
  },
  nouns: {
    register: 'आपका पीएम सूर्य घर रजिस्ट्रेशन',
    credit: 'सब्सिडी पर आपका जवाब',
    bank: 'बैंक में आपकी मुलाकात',
    layout: 'आपका पैनल लेआउट',
  },
};

export const STEP_LISTS = { en: EN_STEPS, mr: MR_STEPS, hi: HI_STEPS };
export const STEP_WORDS = localized(EN_STEPS, { mr: MR_STEPS, hi: HI_STEPS });
