/**
 * Hindi copy for family access: the same shape as `../en/family.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/family';

export const FAMILY: Copy<typeof en.FAMILY> = {
  cardTitle: 'परिवार को ऐक्सेस',
  cardHint: 'परिवार के लोग अपने फ़ोन से प्रोजेक्ट देख सकें और पेमेंट कर सकें।',
  open: 'लोग जोड़ें या हटाएँ',
  title: 'परिवार को ऐक्सेस',
  intro:
    'आप जिन्हें जोड़ेंगे, वे अपने मोबाइल नंबर से साइन इन करके वही प्रोजेक्ट, दस्तावेज़ और पेमेंट देखेंगे। WhatsApp अपडेट आपके ही नंबर पर आते रहेंगे।',
  viewerIntro: (owner) =>
    `आप ${owner} के परिवार के सदस्य के रूप में साइन इन हैं। लोगों को जोड़ना या हटाना सिर्फ़ ${owner} कर सकते हैं।`,
  empty: 'अभी किसी और के पास ऐक्सेस नहीं है।',
  addTitle: 'परिवार का सदस्य जोड़ें',
  name: 'नाम',
  phone: 'मोबाइल नंबर',
  relation: 'रिश्ता',
  relationHint: 'जैसे: पत्नी, बेटा, भाई।',
  add: 'जोड़ें',
  added: (name) => `${name} अब साइन इन कर सकते हैं।`,
  remove: 'हटाएँ',
  removeLabel: (name) => `${name} को हटाएँ`,
  removeAsk: (name) => `${name} को हटाएँ?`,
  removeAskBody: (name) => `${name} अब साइन इन करके आपके प्रोजेक्ट नहीं देख पाएँगे।`,
  removed: (name) => `${name} का ऐक्सेस हटा दिया गया।`,
  failed: 'यह नहीं हो पाया। कृपया फिर से कोशिश करें।',
};
