import type { ReplyTime } from '@oneohm/domain';
import { homeMr } from '@oneohm/shared';
import type { ChatWords } from './chat-words';
import type { Words } from './language';

/** When a person replies, in Marathi; a named person takes the respectful plural (C15). */
const WHEN: Record<ReplyTime, string> = {
  now: 'लवकरच (सोम–शनि, 9:30–6:30)',
  today: 'आज सकाळी 9:30 नंतर',
  tomorrow: 'उद्या सकाळी 9:30 नंतर',
  monday: 'सोमवारी सकाळी 9:30 नंतर',
};

const CALL: Record<ReplyTime, string> = {
  now: 'आज',
  today: 'आज',
  tomorrow: 'उद्या',
  monday: 'सोमवारी',
};

const replies = (name: string | null, when: ReplyTime) =>
  name
    ? `${name} तुम्हाला ${WHEN[when]} इथे उत्तर देतील.`
    : `आमची टीम तुम्हाला ${WHEN[when]} इथे उत्तर देईल.`;

const toWhom = (name: string | null) => (name ? `${name} यांना` : 'आमच्या टीमला');

/** The chat dictionary in Marathi: the same shape as the English one. */
export const MR_CHAT: Words<ChatWords> = {
  buttons: {
    menu: 'मेनू',
    more: 'आणखी',
    update: 'प्रकल्प अपडेट',
    payments: 'पेमेंट',
    documents: 'कागदपत्रे',
    problem: 'समस्या सांगा',
    problems: 'माझ्या समस्या',
    seeThem: 'ते पाहा',
    sendItNow: 'आता पाठवा',
    visit: 'भेटीची माहिती',
    problemUpdate: 'समस्येची स्थिती',
    quote: 'कोटेशन पाहा',
    receipts: 'पावत्या',
    refer: 'मित्राला सुचवा',
    rewards: 'माझी बक्षिसे',
    talkTeam: 'आमच्या टीमशी बोला',
    sendBill: 'बिलाचा फोटो पाठवा',
    invoice: 'आमचे इनव्हॉइस',
    start: 'पुन्हा सुरू करा',
    viewReceipt: 'पावती पाहा',
  },
  pay: (amount) => `${amount} भरा`,
  payLink: (amount, when, home) =>
    `तुमच्या ${homeMr(home, 'येथील घरासाठी')} ${when ? `${when} ` : ''}*${amount}* भरायचे आहेत.`,
  moreDue: (count) => `आणखी ${count} घरांसाठी पेमेंट बाकी आहे. त्यासाठी आम्हाला इथे विचारा.`,
  quoteChanged: 'ते कोटेशन बदलले आहे — हे सध्याचे आहे.',
  talkTo: (name) => `${name} शी बोला`,
  whatNext: 'पुढे काय?',
  listButton: 'निवडा',
  more: {
    body: 'आम्ही कशात मदत करू?',
    rows: {
      update: { title: 'प्रकल्प अपडेट', description: 'तुमचे सोलर काम कुठपर्यंत आले' },
      payments: { title: 'पेमेंट', description: 'भरलेले, बाकी आणि ऑनलाइन पेमेंट' },
      documents: { title: 'कागदपत्रे', description: 'कोटेशन, पावत्या आणि बिले' },
      paper: { title: 'कागद पाठवा', description: 'आम्हाला हवा असलेला फोटो किंवा PDF पाठवा' },
      problem: { title: 'समस्या सांगा', description: 'काय बिघडले ते सांगा' },
      problems: { title: 'माझ्या समस्या', description: 'तुमच्या समस्यांची स्थिती' },
      warranty: { title: 'वॉरंटी आणि AMC', description: 'तुमचे कव्हर आणि तपासणी भेटी' },
      refer: { title: 'मित्राला सुचवा', description: 'प्रत्येक मित्रासाठी बक्षीस मिळवा' },
      talk: { title: 'आमच्या टीमशी बोला', description: 'इथे उत्तर, सोम–शनि 9:30–6:30' },
      language: { title: 'भाषा', description: 'English, मराठी, हिंदी' },
    },
  },
  home: {
    hello: (name) => (name ? `नमस्कार ${name} 👋` : 'नमस्कार 👋'),
    stage: (home, stage, done, steps) =>
      `तुमचे ${home} येथील सोलर *${stage}* टप्प्यावर आहे (${steps} पैकी ${done} टप्पे).`,
    complete: (home) => `तुमचे ${home} येथील सोलर पूर्ण झाले आहे.`,
    paper: (paper, home) =>
      `आम्हाला ${home ? `तुमच्या ${homeMr(home, 'येथील घरासाठी')} ` : ''}तुमचे *${paper}* हवे आहे.`,
    pay: (amount, home) => `तुमच्या ${homeMr(home, 'येथील घरासाठी')} *${amount}* भरायचे आहेत.`,
    visit: (home, day) => `आमची टीम *${day}* रोजी तुमच्या ${homeMr(home, 'येथील घरी')} येईल.`,
    problem: (home) =>
      `आम्ही ${home ? `तुमच्या ${homeMr(home, 'येथील घरच्या')} ` : 'तुमच्या '}समस्येवर काम करत आहोत.`,
    quote: 'तुमचे कोटेशन तुमच्या उत्तराची वाट पाहत आहे.',
    nothing: 'आज आम्ही कशी मदत करू?',
    count: (count) => `${count} गोष्टी तुमच्याकडून हव्या आहेत.`,
    noProject: (name, when) =>
      `आम्ही तुमचा सोलर प्लॅन तयार करत आहोत. ${name ? `${name} तुम्हाला ${CALL[when]} कॉल करतील` : `आमची टीम तुम्हाला ${CALL[when]} कॉल करेल`}.`,
    seeThem: 'आत्ता तुमच्याकडून हे हवे आहे.',
    paperRow: (home) => (home ? `${homeMr(home, 'येथील घरासाठी')} हवे आहे` : 'तुमच्याकडून हवे आहे'),
    payRow: (home) => `${homeMr(home, 'येथील घरासाठी')} भरायचे आहे`,
    quoteRow: 'तुमच्या उत्तराची वाट',
  },
  smallTalk: {
    thanks: 'आपले स्वागत आहे 🙏',
    ok: 'ठीक आहे 👍',
    morning: 'शुभ सकाळ 🙏',
    evening: 'शुभ संध्याकाळ 🙏',
    night: 'शुभ रात्री 🙏',
  },
  unknown: 'माफ करा, आम्हाला समजले नाही. खालीलपैकी एक निवडा.',
  unsupported: 'माफ करा, आम्हाला ते उघडता आले नाही. कृपया ते फोटो, PDF किंवा मजकूर म्हणून पुन्हा पाठवा.',
  talkReply: replies,
  passed: (name, when) => `धन्यवाद. आम्ही हे ${toWhom(name)} कळवले आहे. ${replies(name, when)}`,
  passedUnknown: (name, when) =>
    `माफ करा, आम्हाला अजूनही समजले नाही. तुमचा मेसेज ${toWhom(name)} पाठवला आहे. ${replies(name, when)}`,
  nightReply: (name, when) =>
    `धन्यवाद. तुमचा मेसेज ${name ? `${name} यांच्याकडे` : 'आमच्या टीमकडे'} आहे. ${replies(name, when)}`,
  handedBack: (name) =>
    `${name ? `${name} आता उपलब्ध नाहीत` : 'आमची टीम आता उपलब्ध नाही'} — आम्ही मदतीसाठी इथे आहोत.`,
  earlier: 'तो आधीचा मेसेज होता — हा सध्याचा आहे.',
  bill: { ask: 'तुम्हाला कोणते बिल हवे आहे?', paper: 'वीज बिल' },
  language: {
    ask: 'आम्ही कोणत्या भाषेत लिहावे?',
    saved: 'ठीक आहे ✅ आता आम्ही मराठीत लिहू.',
  },
  paper: {
    ask: (paper, home) =>
      `कृपया ${home ? `तुमच्या ${homeMr(home, 'येथील घरासाठी')} ` : ''}तुमचे *${paper}* इथे फोटो किंवा PDF म्हणून पाठवा.`,
    list: (papers) => `आम्हाला अजून हवे: ${papers}.\nफोटो किंवा PDF इथे पाठवा.`,
    any: 'फोटो किंवा PDF इथे पाठवा आणि ते काय आहे ते सांगा.',
  },
};
