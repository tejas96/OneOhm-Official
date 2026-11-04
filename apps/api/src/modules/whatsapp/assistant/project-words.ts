import { BANK_SHARE_NAMES, INSTALMENT_NAMES } from '@oneohm/database';
import type { MilestoneTrigger } from '@oneohm/domain';
import { localized, type Words } from './language';

/** "3.27 kW": the size as a customer reads it, never "kWp" (live review C9). */
const kw = (watts: number) => `${Number((watts / 1000).toFixed(2))} kW`;

/**
 * How the chat names a customer's project, its size and its instalments (live review
 * C9): by its town, in panels, and as 1st / 2nd / last instalment. Project and quote
 * codes stay in the PDFs and their captions. Also what happens after a payment (C6).
 */
const EN_PROJECT = {
  projectIn: (city: string) => `Your solar project in ${city}`,
  size: (panels: number, watts: number) =>
    panels > 0 ? `${panels} panels (${kw(watts)})` : kw(watts),
  instalment: INSTALMENT_NAMES['en-IN'],
  bankShare: BANK_SHARE_NAMES['en-IN'],
  next: {
    quotation_accepted: 'a site visit to plan your system',
    material_dispatch: 'we send your panels and inverter and fix the installation day',
    commissioning_completed: 'the net meter and your subsidy papers',
    loan_disbursement: 'we keep you posted here at each step',
  } as Record<MilestoneTrigger, string>,
  paidNext: (trigger: MilestoneTrigger, name: string | null, phone: string | null) =>
    `Thank you, your payment is received. Next: ${EN_NEXT[trigger] ?? EN_NEXT.loan_disbursement}.${name || phone ? ` Your contact: ${name ?? 'our team'}${phone ? `, ${phone}` : ''}.` : ''}`,
  receiptCaption: (number: string) => `Your payment receipt (${number})`,
  partPaid: (amount: string, left: string) =>
    `${amount} received. ${left} is left on this instalment.`,
  /** Over the list of towns when a customer with 2+ homes raises a complaint (M10). */
  whichHome: 'Which home is the problem at?',
  /** A which-home row tapped after that home was cancelled (review F4). */
  homeGone: 'That home is no longer active.',
};
const EN_NEXT = EN_PROJECT.next;

const MR_NEXT: Record<MilestoneTrigger, string> = {
  quotation_accepted: 'सिस्टमच्या नियोजनासाठी साइट भेट',
  material_dispatch: 'पॅनल आणि इन्व्हर्टर पाठवून बसवणीचा दिवस ठरवणे',
  commissioning_completed: 'नेट मीटर आणि तुमच्या सबसिडीची कागदपत्रे',
  loan_disbursement: 'प्रत्येक टप्प्यावर आम्ही इथे कळवत राहू',
};

const MR_PROJECT: Words<typeof EN_PROJECT> = {
  projectIn: (city) => `${city} येथील तुमचा सोलर प्रकल्प`,
  size: (panels, watts) => (panels > 0 ? `${panels} पॅनल (${kw(watts)})` : kw(watts)),
  instalment: INSTALMENT_NAMES['mr-IN'],
  bankShare: BANK_SHARE_NAMES['mr-IN'],
  next: MR_NEXT,
  paidNext: (trigger, name, phone) =>
    `धन्यवाद, तुमचे पेमेंट मिळाले. पुढे: ${MR_NEXT[trigger] ?? MR_NEXT.loan_disbursement}.${name || phone ? ` तुमचा संपर्क: ${name ?? 'आमची टीम'}${phone ? `, ${phone}` : ''}.` : ''}`,
  receiptCaption: (number) => `तुमची पेमेंट पावती (${number})`,
  partPaid: (amount, left) => `${amount} मिळाले. या हप्त्याचे ${left} बाकी आहेत.`,
  whichHome: 'समस्या कोणत्या घरी आहे?',
  homeGone: 'ते घर आता सक्रिय नाही.',
};

const HI_NEXT: Record<MilestoneTrigger, string> = {
  quotation_accepted: 'सिस्टम की योजना के लिए साइट विज़िट',
  material_dispatch: 'पैनल और इन्वर्टर भेजकर इंस्टॉलेशन का दिन तय करना',
  commissioning_completed: 'नेट मीटर और आपकी सब्सिडी के कागज़',
  loan_disbursement: 'हर कदम पर हम यहाँ बताते रहेंगे',
};

const HI_PROJECT: Words<typeof EN_PROJECT> = {
  projectIn: (city) => `${city} में आपका सोलर प्रोजेक्ट`,
  size: (panels, watts) => (panels > 0 ? `${panels} पैनल (${kw(watts)})` : kw(watts)),
  instalment: INSTALMENT_NAMES['hi-IN'],
  bankShare: BANK_SHARE_NAMES['hi-IN'],
  next: HI_NEXT,
  paidNext: (trigger, name, phone) =>
    `धन्यवाद, आपका पेमेंट मिल गया. आगे: ${HI_NEXT[trigger] ?? HI_NEXT.loan_disbursement}.${name || phone ? ` आपके संपर्क: ${name ?? 'हमारी टीम'}${phone ? `, ${phone}` : ''}.` : ''}`,
  receiptCaption: (number) => `आपकी पेमेंट रसीद (${number})`,
  partPaid: (amount, left) => `${amount} मिल गए. इस किस्त के ${left} बाकी हैं.`,
  whichHome: 'समस्या किस घर में है?',
  homeGone: 'वह घर अब सक्रिय नहीं है।',
};

/** Every language, for the checks. */
export const PROJECT_LISTS = { en: EN_PROJECT, mr: MR_PROJECT, hi: HI_PROJECT };
export const PROJECT_WORDS = localized(EN_PROJECT, { mr: MR_PROJECT, hi: HI_PROJECT });
