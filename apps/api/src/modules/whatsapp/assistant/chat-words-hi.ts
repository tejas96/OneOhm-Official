import type { ReplyTime } from '@oneohm/domain';
import type { ChatWords } from './chat-words';
import type { Words } from './language';

/** When a person replies, in Hindi; a named person takes the respectful plural. */
const WHEN: Record<ReplyTime, string> = {
  now: 'जल्द ही (सोम–शनि, 9:30–6:30)',
  today: 'आज सुबह 9:30 के बाद',
  tomorrow: 'कल सुबह 9:30 के बाद',
  monday: 'सोमवार सुबह 9:30 के बाद',
};

const CALL: Record<ReplyTime, string> = {
  now: 'आज',
  today: 'आज',
  tomorrow: 'कल',
  monday: 'सोमवार को',
};

const replies = (name: string | null, when: ReplyTime) =>
  name ? `${name} आपको ${WHEN[when]} यहीं जवाब देंगे।` : `हमारी टीम आपको ${WHEN[when]} यहीं जवाब देगी।`;

const toWhom = (name: string | null) => (name ? `${name} को` : 'हमारी टीम को');

/** The chat dictionary in Hindi: the same shape as the English one. */
export const HI_CHAT: Words<ChatWords> = {
  buttons: {
    menu: 'मेनू',
    more: 'और',
    update: 'प्रोजेक्ट अपडेट',
    payments: 'पेमेंट',
    documents: 'दस्तावेज़',
    problem: 'समस्या बताएँ',
    problems: 'मेरी समस्याएँ',
    seeThem: 'देखें',
    sendItNow: 'अभी भेजें',
    visit: 'विज़िट की जानकारी',
    problemUpdate: 'समस्या की स्थिति',
    quote: 'कोटेशन देखें',
    receipts: 'रसीदें',
    refer: 'दोस्त को बताएँ',
    rewards: 'मेरे इनाम',
    talkTeam: 'टीम से बात करें',
    sendBill: 'बिल की फ़ोटो भेजें',
    invoice: 'हमारा इनवॉइस',
    start: 'फिर से शुरू करें',
    viewReceipt: 'रसीद देखें',
  },
  pay: (amount) => `${amount} भरें`,
  payLink: (amount, when, home) =>
    `${home} वाले घर के लिए ${when ? `${when} ` : ''}*${amount}* भरने हैं।`,
  moreDue: (count) => `${count} और घरों का पेमेंट बाकी है। उसके लिए हमसे यहाँ पूछें।`,
  quoteChanged: 'वह कोटेशन बदल गया है — यह ताज़ा है।',
  talkTo: (name) => `${name} से बात करें`,
  whatNext: 'आगे क्या?',
  listButton: 'चुनें',
  more: {
    body: 'हम किसमें मदद करें?',
    rows: {
      update: { title: 'प्रोजेक्ट अपडेट', description: 'आपका सोलर काम कहाँ तक पहुँचा' },
      payments: { title: 'पेमेंट', description: 'भरा हुआ, बाकी और ऑनलाइन पेमेंट' },
      documents: { title: 'दस्तावेज़', description: 'कोटेशन, रसीदें और बिल' },
      paper: { title: 'कागज़ भेजें', description: 'हमें चाहिए वह फ़ोटो या PDF भेजें' },
      problem: { title: 'समस्या बताएँ', description: 'क्या खराब है, बताएँ' },
      problems: { title: 'मेरी समस्याएँ', description: 'आपकी समस्याओं की स्थिति' },
      warranty: { title: 'वारंटी और AMC', description: 'आपका कवर और जाँच विज़िट' },
      refer: { title: 'दोस्त को बताएँ', description: 'हर दोस्त के लिए इनाम पाएँ' },
      talk: { title: 'टीम से बात करें', description: 'यहीं जवाब, सोम–शनि 9:30–6:30' },
      language: { title: 'भाषा', description: 'English, मराठी, हिंदी' },
    },
  },
  home: {
    hello: (name) => (name ? `नमस्ते ${name} 👋` : 'नमस्ते 👋'),
    stage: (home, stage, done, steps) =>
      `${home} में आपका सोलर *${stage}* पर है (${steps} में से ${done} चरण)।`,
    complete: (home) => `${home} में आपका सोलर पूरा हो गया है।`,
    paper: (paper, home) => `हमें ${home ? `${home} वाले घर के लिए ` : ''}आपका *${paper}* चाहिए।`,
    pay: (amount, home) => `${home} वाले घर के लिए *${amount}* भरने हैं।`,
    visit: (home, day) => `हमारी टीम *${day}* को आपके ${home ? `${home} वाले ` : ''}घर आएगी।`,
    problem: (home) => `हम ${home ? `${home} वाले घर की ` : 'आपकी '}समस्या पर काम कर रहे हैं।`,
    quote: 'आपका कोटेशन आपके जवाब का इंतज़ार कर रहा है।',
    nothing: 'आज हम कैसे मदद करें?',
    count: (count) => `${count} चीज़ें आपसे चाहिए।`,
    noProject: (name, when) =>
      `हम आपका सोलर प्लान तैयार कर रहे हैं। ${name ? `${name} आपको ${CALL[when]} कॉल करेंगे` : `हमारी टीम आपको ${CALL[when]} कॉल करेगी`}।`,
    seeThem: 'अभी आपसे यह चाहिए।',
    paperRow: (home) => (home ? `${home} वाले घर के लिए चाहिए` : 'आपसे चाहिए'),
    payRow: (home) => `${home} वाले घर के लिए बाकी`,
    quoteRow: 'आपके जवाब का इंतज़ार',
  },
  smallTalk: {
    thanks: 'आपका स्वागत है 🙏',
    ok: 'ठीक है 👍',
    morning: 'सुप्रभात 🙏',
    evening: 'शुभ संध्या 🙏',
    night: 'शुभ रात्रि 🙏',
  },
  unknown: 'माफ़ कीजिए, हम समझ नहीं पाए। नीचे से एक चुनें।',
  talkReply: replies,
  passed: (name, when) => `धन्यवाद। हमने यह ${toWhom(name)} बता दिया है। ${replies(name, when)}`,
  passedUnknown: (name, when) =>
    `माफ़ कीजिए, हम अब भी समझ नहीं पाए। आपका मेसेज ${toWhom(name)} भेज दिया है। ${replies(name, when)}`,
  nightReply: (name, when) =>
    `धन्यवाद। आपका मेसेज ${name ? `${name} के पास` : 'हमारी टीम के पास'} है। ${replies(name, when)}`,
  handedBack: (name) =>
    `${name ? `${name} अभी उपलब्ध नहीं हैं` : 'हमारी टीम अभी उपलब्ध नहीं है'} — हम मदद के लिए यहाँ हैं।`,
  earlier: 'वह पुराना मेसेज था — यह ताज़ा है।',
  bill: { ask: 'आप किस बिल की बात कर रहे हैं?', paper: 'बिजली बिल' },
  language: {
    ask: 'हम किस भाषा में लिखें?',
    saved: 'ठीक है ✅ अब हम हिंदी में लिखेंगे।',
  },
  paper: {
    ask: (paper, home) =>
      `कृपया ${home ? `${home} वाले घर के लिए ` : ''}अपना *${paper}* यहाँ फ़ोटो या PDF में भेजें।`,
    list: (papers) => `हमें अभी भी चाहिए: ${papers}।\nफ़ोटो या PDF यहाँ भेजें।`,
    any: 'फ़ोटो या PDF यहाँ भेजें और बताएँ कि यह क्या है।',
  },
};
