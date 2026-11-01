/**
 * Hindi copy for payments, the invoice and receipts, and documents: the same shape as
 * `../en/money.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import { type Copy, lookup } from '@/i18n/copy';
import type * as en from '../en/money';

/** The usual payment steps by plan key; a step the team named differently keeps its name. */
const PAYMENT_STEPS = {
  advance: 'ऑर्डर पक्का होने पर एडवांस',
  before_dispatch: 'पैनल और इन्वर्टर भेजने से पहले',
  final: 'फ़िटिंग और सिस्टम चालू होने के बाद',
  bank_disbursement: 'बैंक लोन की रकम',
};

/** Official papers keep their short English name, which offices ask for. */
const REPORTS = {
  'model-agreement': 'मॉडल एग्रीमेंट',
  'net-metering-agreement': 'नेट मीटरिंग एग्रीमेंट',
  wcr: 'काम पूरा होने की रिपोर्ट (WCR)',
  dcr: 'DCR अंडरटेकिंग',
  'annexure-proforma-a': 'एनेक्सर-I और प्रोफ़ॉर्मा-A',
  'meter-test-letter': 'मीटर टेस्ट का पत्र',
};

export const PAYMENTS: Copy<typeof en.PAYMENTS> = {
  payNow: (amount) => `${amount} अभी भरें`,
  payHint: 'UPI, कार्ड या नेट बैंकिंग, Razorpay से।',
  title: 'पेमेंट',
  loading: 'आपके पेमेंट लोड हो रहे हैं',
  paidOf: (paid, total) => `${total} में से ${paid} भरे`,
  progressLabel: (percent) => `प्रोजेक्ट की कीमत का ${percent}% भरा`,
  remaining: 'अभी भरना है',
  allPaid: 'सारा पेमेंट हो गया है। धन्यवाद!',
  scheduleTitle: 'पेमेंट का शेड्यूल',
  yourShare: 'आपको भरना है',
  bankShare: 'बैंक भरेगा (लोन)',
  waitingForBank: 'बैंक से रकम आने का इंतज़ार',
  status: {
    upcoming: 'अभी समय है',
    due: 'अभी भरना है',
    partly_paid: 'थोड़ा भरा',
    paid: 'भरा गया',
  },
  paidSoFar: (amount) => `${amount} मिले`,
  dueOn: (date) => `${date} तक भरना है`,
  howToPayTitle: 'पेमेंट कैसे करें',
  howToPayBody: 'आपके OneOhm संपर्क पेमेंट की जानकारी देंगे। पैसे भेजने से पहले खाता उनसे ज़रूर पक्का कर लें।',
  callContact: (name) => `${name} को फ़ोन करें`,
  subsidyNote: (amount) =>
    `${amount} की अनुमानित सरकारी सब्सिडी सरकार सीधे आपके बैंक खाते में भेजती है; यह इन पेमेंट में शामिल नहीं है।`,
  noProject: 'प्रोजेक्ट शुरू होने पर पेमेंट यहाँ दिखेंगे।',
  milestone: (key, label) => lookup(PAYMENT_STEPS, key) ?? label,
};

export const BILLING: Copy<typeof en.BILLING> = {
  title: 'बिल और रसीदें',
  loading: 'आपका बिल और रसीदें लोड हो रही हैं',
  invoice: (total) => `टैक्स इनवॉइस · ${total}`,
  invoiceMeta: (number, date) => `${number} · ${date}`,
  noInvoice: 'प्रोजेक्ट की पूरी कीमत का GST टैक्स इनवॉइस बनते ही यहाँ दिखेगा।',
  receipt: (amount) => `रसीद · ${amount}`,
  receiptMeta: (number, date, purpose) => [number, date, purpose].filter(Boolean).join(' · '),
  reversed: 'रद्द',
  refundsTitle: 'आपको लौटाए गए पैसे',
  refund: (amount) => `${amount} लौटाए`,
  refundMeta: (date, method) => `${date} · ${method}`,
  refundMethod: {
    bank_transfer: 'बैंक ट्रांसफ़र',
    upi: 'UPI',
    razorpay: 'आपके कार्ड या UPI पर वापस',
    cheque: 'चेक',
    cash: 'नकद',
  },
  credit: (amount) =>
    `बकाया से ज़्यादा भरे गए ${amount} आपके लिए रखे गए हैं। OneOhm इन्हें अगले पेमेंट में जोड़ेगा या लौटा देगा।`,
};

export const DOCUMENTS: Copy<typeof en.DOCUMENTS> = {
  title: 'दस्तावेज़',
  loading: 'आपके दस्तावेज़ लोड हो रहे हैं',
  quotationTitle: 'आपका कोटेशन',
  quotationBody: (number) => `कोटेशन ${number}: कीमत, सब्सिडी और असल खर्च।`,
  invoiceTitle: 'आपका टैक्स इनवॉइस',
  invoiceBody: (date, project) => [project, 'GST टैक्स इनवॉइस', date].filter(Boolean).join(' · '),
  reportsTitle: 'एग्रीमेंट और रिपोर्ट',
  reportsEmpty: 'एग्रीमेंट और काम पूरा होने की रिपोर्ट तैयार होते ही यहाँ दिखेंगी।',
  filesTitle: 'आपके कागज़',
  filesEmpty: 'OneOhm के भेजे बिल, वारंटी कार्ड और हैंडओवर के कागज़ यहाँ दिखेंगे।',
  open: 'खोलें',
  opening: 'खुल रहा है',
  openFailed: 'यह फ़ाइल नहीं खुली। कृपया फिर से कोशिश करें।',
  requestsTitle: 'OneOhm को आपसे चाहिए',
  requestsIntro: 'साफ़ फ़ोटो या PDF भेजें। यह सीधे आपके प्रोजेक्ट की फ़ाइल में जाता है।',
  requestMeta: (project, kind) => [kind, project].filter(Boolean).join(' · '),
  takePhoto: 'कैमरा',
  choosePhoto: 'फ़ोटो',
  chooseFile: 'PDF',
  sending: 'भेज रहे हैं',
  sent: (title) => `${title} भेज दिया। धन्यवाद।`,
  sentOn: (date) => `${date} को भेजा`,
  cameraDenied: 'फ़ोटो लेने के लिए फ़ोन की सेटिंग में कैमरे की अनुमति दें।',
  libraryDenied: 'फ़ोटो चुनने के लिए फ़ोन की सेटिंग में फ़ोटो की अनुमति दें।',
  sendFailed: 'यह फ़ाइल नहीं भेजी जा सकी। कृपया फिर से कोशिश करें।',
  category: {
    site_survey: 'साइट विज़िट रिपोर्ट',
    customer_kyc: 'पहचान पत्र',
    electricity_bill: 'बिजली बिल',
    property: 'घर के कागज़',
    quotation: 'कोटेशन',
    invoice_receipt: 'बिल या रसीद',
    bank_loan: 'बैंक लोन',
    discom: 'बिजली बोर्ड',
    subsidy: 'सब्सिडी',
    commissioning_handover: 'हैंडओवर',
    warranty: 'वारंटी',
    statutory_report: 'रिपोर्ट',
    site_photo: 'साइट की फ़ोटो',
    other: 'दस्तावेज़',
  },
  report: (key, name) => lookup(REPORTS, key) ?? name,
  size: (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, kb)} KB`),
};
