/**
 * Marathi copy for payments, the invoice and receipts, and documents: the same shape as
 * `../en/money.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import { type Copy, lookup } from '@/i18n/copy';
import type * as en from '../en/money';

/** The usual payment steps by plan key; a step the team named differently keeps its name. */
const PAYMENT_STEPS = {
  advance: 'ऑर्डर पक्की झाल्यावर ॲडव्हान्स',
  before_dispatch: 'पॅनल आणि इन्व्हर्टर पाठवण्याआधी',
  final: 'बसवून सिस्टिम सुरू झाल्यावर',
  bank_disbursement: 'बँकेच्या कर्जाची रक्कम',
};

/** Official papers keep their short English name, which offices ask for. */
const REPORTS = {
  'model-agreement': 'मॉडेल करारनामा',
  'net-metering-agreement': 'नेट मीटरिंग करार',
  wcr: 'काम पूर्ण झाल्याचा रिपोर्ट (WCR)',
  dcr: 'DCR हमीपत्र',
  'annexure-proforma-a': 'परिशिष्ट-I आणि प्रोफॉर्मा-A',
  'meter-test-letter': 'मीटर तपासणीचे पत्र',
};

export const PAYMENTS: Copy<typeof en.PAYMENTS> = {
  payNow: (amount) => `${amount} आता भरा`,
  payHint: 'UPI, कार्ड किंवा नेट बँकिंग, Razorpay द्वारे.',
  payFailed: 'पेमेंटचे पान उघडले नाही. पुन्हा प्रयत्न करा, किंवा तुमच्या संपर्काला फोन करा.',
  effectiveCost: (price, subsidy, effective) =>
    `किंमत ${price} − अपेक्षित सबसिडी ${subsidy} = तुमचा खरा खर्च ${effective}`,
  title: 'पेमेंट',
  loading: 'तुमचे पेमेंट लोड होत आहे',
  paidOf: (paid, total) => `${total} पैकी ${paid} भरले`,
  progressLabel: (percent) => `प्रकल्पाच्या किमतीपैकी ${percent}% भरले`,
  remaining: 'अजून भरायचे',
  allPaid: 'सगळे पैसे भरले आहेत. धन्यवाद!',
  scheduleTitle: 'पेमेंटचे वेळापत्रक',
  yourShare: 'तुम्ही भरायचे',
  bankShare: 'बँक भरणार (कर्ज)',
  waitingForBank: 'बँकेकडून रक्कम येण्याची वाट',
  status: {
    upcoming: 'अजून वेळ आहे',
    due: 'आता भरायचे',
    partly_paid: 'थोडे भरले',
    paid: 'भरले',
  },
  paidSoFar: (amount) => `${amount} मिळाले`,
  dueOn: (date) => `${date} पर्यंत भरायचे`,
  howToPayTitle: 'पैसे कसे भरायचे',
  howToPayBody: 'तुमचे संपर्क पेमेंटची माहिती देतील. पैसे भरण्याआधी खात्याची खात्री त्यांच्याकडून नक्की करून घ्या.',
  callContact: (name) => `${name} यांना फोन करा`,
  subsidyNote: (amount) =>
    `अपेक्षित ${amount} सरकारी सबसिडी सरकार थेट तुमच्या बँक खात्यात जमा करते; ती या पेमेंटमध्ये धरलेली नाही.`,
  noProject: 'प्रकल्प सुरू झाल्यावर पेमेंट इथे दिसतील.',
  milestone: (key, label) => lookup(PAYMENT_STEPS, key) ?? label,
};

export const BILLING: Copy<typeof en.BILLING> = {
  title: 'बिल आणि पावत्या',
  loading: 'तुमचे बिल आणि पावत्या लोड होत आहेत',
  invoice: (total) => `टॅक्स इनव्हॉइस · ${total}`,
  invoiceMeta: (number, date) => `${number} · ${date}`,
  noInvoice: 'प्रकल्पाच्या पूर्ण किमतीचे GST टॅक्स इनव्हॉइस तयार झाले की इथे दिसेल.',
  receipt: (amount) => `पावती · ${amount}`,
  receiptMeta: (number, date, purpose) => [number, date, purpose].filter(Boolean).join(' · '),
  reversed: 'रद्द',
  refundsTitle: 'तुम्हाला परत केलेले पैसे',
  refund: (amount) => `${amount} परत केले`,
  refundMeta: (date, method) => `${date} · ${method}`,
  refundMethod: {
    bank_transfer: 'बँक ट्रान्सफर',
    upi: 'UPI',
    razorpay: 'तुमच्या कार्ड किंवा UPI वर परत',
    cheque: 'चेक',
    cash: 'रोख',
  },
  credit: (amount) =>
    `भरायच्यापेक्षा जास्त भरलेले ${amount} तुमच्यासाठी राखून ठेवले आहेत. आम्ही ते पुढच्या पेमेंटमध्ये धरू किंवा परत करू.`,
};

export const DOCUMENTS: Copy<typeof en.DOCUMENTS> = {
  title: 'कागदपत्रे',
  loading: 'तुमची कागदपत्रे लोड होत आहेत',
  quotationTitle: 'तुमचे कोटेशन',
  quotationBody: (number) => `कोटेशन ${number}: किंमत, सबसिडी आणि प्रत्यक्ष खर्च.`,
  invoiceTitle: 'तुमचे टॅक्स इनव्हॉइस',
  invoiceBody: (date, project) => [project, 'GST टॅक्स इनव्हॉइस', date].filter(Boolean).join(' · '),
  reportsTitle: 'करार आणि रिपोर्ट',
  reportsEmpty: 'करार आणि काम पूर्ण झाल्याचे रिपोर्ट तयार झाले की इथे दिसतील.',
  filesTitle: 'तुमची कागदपत्रे',
  filesEmpty:
    'आम्ही पाठवलेली बिले, वॉरंटी कार्ड, वापरण्याच्या पुस्तिका आणि सिस्टिम ताब्यात दिल्याची कागदपत्रे इथे दिसतील.',
  open: 'उघडा',
  opening: 'उघडत आहे',
  openFailed: 'ही फाईल उघडली नाही. कृपया पुन्हा प्रयत्न करा.',
  requestsTitle: 'आम्हाला तुमच्याकडून हवे',
  requestsIntro: 'स्पष्ट फोटो किंवा PDF पाठवा. ते थेट तुमच्या प्रकल्पाच्या फाईलमध्ये जाते.',
  requestMeta: (project, kind) => [kind, project].filter(Boolean).join(' · '),
  takePhoto: 'कॅमेरा',
  choosePhoto: 'फोटो',
  chooseFile: 'PDF',
  sending: 'पाठवत आहे',
  sent: (title) => `${title} पाठवले. धन्यवाद.`,
  sentOn: (date) => `${date} ला पाठवले`,
  cameraDenied: 'फोटो काढण्यासाठी फोनच्या सेटिंगमध्ये कॅमेऱ्याची परवानगी द्या.',
  libraryDenied: 'फोटो निवडण्यासाठी फोनच्या सेटिंगमध्ये फोटोंची परवानगी द्या.',
  sendFailed: 'ही फाईल पाठवता आली नाही. कृपया पुन्हा प्रयत्न करा.',
  category: {
    site_survey: 'साईट भेटीचा रिपोर्ट',
    customer_kyc: 'ओळखपत्र',
    electricity_bill: 'वीज बिल',
    property: 'घराचे कागद',
    quotation: 'कोटेशन',
    invoice_receipt: 'बिल किंवा पावती',
    bank_loan: 'बँक कर्ज',
    discom: 'वीज मंडळ',
    subsidy: 'सबसिडी',
    income_proof: 'उत्पन्नाचा पुरावा',
    commissioning_handover: 'सिस्टिम ताब्यात दिल्याचे',
    warranty: 'वॉरंटी',
    product_manual: 'वापरण्याची माहिती पुस्तिका',
    statutory_report: 'रिपोर्ट',
    site_photo: 'साईटचा फोटो',
    other: 'कागदपत्र',
  },
  report: (key, name) => lookup(REPORTS, key) ?? name,
  size: (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, kb)} KB`),
};
