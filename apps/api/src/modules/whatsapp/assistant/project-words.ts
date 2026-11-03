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
  size: (panels: number, watts: number) => `${panels} panels (${kw(watts)})`,
  instalment: (index: number, count: number) =>
    index === count - 1 && count > 1
      ? 'Last instalment'
      : `${['1st', '2nd', '3rd'][index] ?? `${index + 1}th`} instalment`,
  bankShare: 'Bank loan',
  next: {
    quotation_accepted: 'a site visit to plan your system',
    material_dispatch: 'we send your panels and inverter and fix the installation day',
    commissioning_completed: 'the net meter and your subsidy papers',
    loan_disbursement: 'we keep you posted here at each step',
  } as Record<MilestoneTrigger, string>,
  paidNext: (trigger: MilestoneTrigger, name: string | null, phone: string | null) =>
    `Thank you, your payment is received. Next: ${EN_NEXT[trigger] ?? EN_NEXT.loan_disbursement}.${name ? ` Your contact: ${name}${phone ? `, ${phone}` : ''}.` : ''}`,
  receiptCaption: (number: string) => `Your payment receipt (${number})`,
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
  size: (panels, watts) => `${panels} पॅनल (${kw(watts)})`,
  instalment: (index, count) =>
    index === count - 1 && count > 1
      ? 'शेवटचा हप्ता'
      : `${['पहिला', 'दुसरा', 'तिसरा'][index] ?? `${index + 1}वा`} हप्ता`,
  bankShare: 'बँक कर्ज',
  next: MR_NEXT,
  paidNext: (trigger, name, phone) =>
    `धन्यवाद, तुमचे पेमेंट मिळाले. पुढे: ${MR_NEXT[trigger] ?? MR_NEXT.loan_disbursement}.${name ? ` तुमचा संपर्क: ${name}${phone ? `, ${phone}` : ''}.` : ''}`,
  receiptCaption: (number) => `तुमची पेमेंट पावती (${number})`,
};

const HI_NEXT: Record<MilestoneTrigger, string> = {
  quotation_accepted: 'सिस्टम की योजना के लिए साइट विज़िट',
  material_dispatch: 'पैनल और इन्वर्टर भेजकर इंस्टॉलेशन का दिन तय करना',
  commissioning_completed: 'नेट मीटर और आपकी सब्सिडी के कागज़',
  loan_disbursement: 'हर कदम पर हम यहाँ बताते रहेंगे',
};

const HI_PROJECT: Words<typeof EN_PROJECT> = {
  projectIn: (city) => `${city} में आपका सोलर प्रोजेक्ट`,
  size: (panels, watts) => `${panels} पैनल (${kw(watts)})`,
  instalment: (index, count) =>
    index === count - 1 && count > 1
      ? 'आखिरी किस्त'
      : `${['पहली', 'दूसरी', 'तीसरी'][index] ?? `${index + 1}वीं`} किस्त`,
  bankShare: 'बैंक लोन',
  next: HI_NEXT,
  paidNext: (trigger, name, phone) =>
    `धन्यवाद, आपका पेमेंट मिल गया. आगे: ${HI_NEXT[trigger] ?? HI_NEXT.loan_disbursement}.${name ? ` आपके संपर्क: ${name}${phone ? `, ${phone}` : ''}.` : ''}`,
  receiptCaption: (number) => `आपकी पेमेंट रसीद (${number})`,
};

/** Every language, for the checks. */
export const PROJECT_LISTS = { en: EN_PROJECT, mr: MR_PROJECT, hi: HI_PROJECT };
export const PROJECT_WORDS = localized(EN_PROJECT, { mr: MR_PROJECT, hi: HI_PROJECT });
