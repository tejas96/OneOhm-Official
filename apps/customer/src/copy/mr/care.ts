/**
 * Marathi copy for help requests, referrals and the overall rating: the same shape as
 * `../en/care.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import { type Copy, lookup } from '@/i18n/copy';
import type * as en from '../en/care';

/** The kinds of problem OneOhm ships with; ones the team added keep their own name. */
const CATEGORIES = {
  no_generation: 'सोलरमधून वीज येत नाही',
  low_generation: 'नेहमीपेक्षा कमी वीज',
  inverter_error: 'इन्व्हर्टरवर एरर किंवा अलार्म',
  physical_damage: 'पॅनल किंवा वायरिंगचे नुकसान',
  cleaning: 'पॅनलची साफसफाई',
  billing_net_meter: 'वीज बिल किंवा नेट मीटर',
  subsidy: 'सबसिडीबद्दल प्रश्न',
  other: 'इतर काही',
  maintenance_visit: 'देखभाल भेट',
};

type ReferEvent = 'project_created' | 'advance_paid' | 'commissioned';
const WHEN_FRIEND: Readonly<Record<ReferEvent, string>> = {
  project_created: 'तुमच्या मित्राने सोलर प्रकल्प बुक केल्यावर',
  advance_paid: 'तुमच्या मित्राने ॲडव्हान्स भरल्यावर',
  commissioned: 'तुमच्या मित्राची सिस्टिम सुरू झाल्यावर',
};

const STARS = ['खराब', 'अजून चांगले हवे', 'चांगले', 'खूप चांगले', 'उत्कृष्ट'] as const;
const DO_BETTER = 'काय चांगले झाले, आणि आम्ही काय अजून चांगले करू शकलो असतो?';

export const SUPPORT: Copy<typeof en.SUPPORT> = {
  title: 'मदत',
  intro: 'सिस्टिममध्ये काही अडचण आहे? आम्हाला सांगा, आमची सर्व्हिस टीम तुम्हाला फोन करेल.',
  loading: 'तुमच्या विनंत्या लोड होत आहेत',
  newRequest: 'मदत मागा',
  formTitle: 'कशासाठी मदत हवी आहे?',
  formDescription: 'जवळचा पर्याय निवडा आणि थोडक्यात सांगा.',
  categoryLabel: 'अडचणीचा प्रकार',
  categoryNeeded: 'अडचणीचा प्रकार निवडा.',
  descriptionNeeded: 'थोडे अजून सांगा, किंवा व्हॉइस नोट रेकॉर्ड करा.',
  projectLabel: 'कोणती सिस्टिम',
  descriptionLabel: 'काय होत आहे?',
  descriptionHint: 'उदा. आज सकाळपासून इन्व्हर्टरवर लाल दिवा दिसत आहे.',
  submit: 'विनंती पाठवा',
  sent: 'पाठवले. आमची सर्व्हिस टीम तुम्हाला फोन करेल.',
  historyTitle: 'तुमच्या विनंत्या',
  emptyTitle: 'अजून कोणतीही विनंती नाही',
  emptyBody: 'सिस्टिममध्ये काही बिघडले तर इथे मदत मागा.',
  status: { open: 'मिळाली', in_progress: 'काम सुरू आहे', resolved: 'सोडवली' },
  raisedOn: (date) => `${date} ला केली`,
  resolution: 'आम्ही काय केले',
  photosLabel: 'फोटो',
  photosHint: 'हवे असल्यास. इन्व्हर्टरच्या स्क्रीनचा किंवा पॅनलचा फोटो असेल तर आम्ही तयारीने येऊ.',
  takePhoto: 'फोटो काढा',
  choosePhotos: 'फोटो निवडा',
  removePhoto: 'फोटो काढून टाका',
  photoCount: (count) => `${count} फोटो`,
  photosFailed: (count) =>
    count === 1 ? 'पाठवले, पण 1 फोटो अपलोड झाला नाही.' : `पाठवले, पण ${count} फोटो अपलोड झाले नाहीत.`,
  cameraDenied: 'फोटो काढण्यासाठी फोनच्या सेटिंगमध्ये कॅमेऱ्याची परवानगी द्या.',
  libraryDenied: 'फोटो जोडण्यासाठी फोनच्या सेटिंगमध्ये फोटोंची परवानगी द्या.',
  category: (key, label) => lookup(CATEGORIES, key) ?? label,
};

export const REFER: Copy<typeof en.REFER> = {
  title: 'शेजाऱ्याला सुचवा',
  intro: 'कोणाला वीज बिल कमी करायचे आहे? त्यांचा नंबर द्या, आमची टीम त्यांना फोन करेल.',
  nameLabel: 'त्यांचे नाव',
  phoneLabel: 'त्यांचा मोबाईल नंबर',
  cityLabel: 'गाव किंवा शहर',
  noteLabel: 'आम्हाला अजून काही सांगायचे आहे?',
  submit: 'नाव पाठवा',
  sent: 'धन्यवाद! आम्ही त्यांना लवकरच फोन करू.',
  historyTitle: 'तुम्ही सुचवलेले लोक',
  emptyBody: 'तुम्ही सुचवलेले लोक आणि त्यांचे काम कुठवर आले ते इथे दिसेल.',
  status: {
    received: 'मिळाले',
    in_progress: 'आमच्या टीमशी बोलणे सुरू',
    ordered: 'सोलर बसवत आहेत',
    installed: 'सोलर बसवला',
    closed: 'बंद',
  },
  referredOn: (date) => `${date} ला सुचवले`,
  codeTitle: 'तुमचा रेफरल कोड',
  codeLabel: (code) => `तुमचा रेफरल कोड ${code} आहे`,
  codeHint: 'मित्र WhatsApp वर किंवा आमची टीम फोन करेल तेव्हा हा कोड सांगतील.',
  terms: (amount, event) => `${WHEN_FRIEND[event]} तुम्हाला ${amount} मिळतील.`,
  termsPerKw: (amount, event) =>
    `${WHEN_FRIEND[event]} त्यांच्या प्रत्येक kW साठी तुम्हाला ${amount} मिळतील.`,
  termsOff: 'सोलर हवा असणाऱ्या कोणालाही तुमचा कोड द्या. आम्ही त्यांना फोन करू आणि तुम्हाला कळवत राहू.',
  approvalNote: 'प्रत्येक बक्षीस आम्ही मंजूर करतो आणि मग तुम्हाला देतो.',
  shareWhatsApp: 'WhatsApp वर पाठवा',
  shareOther: 'दुसऱ्या प्रकारे पाठवा',
  shareFailed: 'शेअर उघडले नाही. तुमचा कोड मित्राला सांगा.',
  shareText: (code, link, company) =>
    link
      ? `मी ${company} कडून सोलर बसवला आणि माझे वीज बिल कमी झाले. तुम्हालाही सोलर हवा आहे का? माझा रेफरल कोड ${code} सांगून ${company} ला WhatsApp करा: ${link}`
      : `मी ${company} कडून सोलर बसवला आणि माझे वीज बिल कमी झाले. तुम्हालाही सोलर हवा आहे का? ${company} ला फोन करा आणि माझा रेफरल कोड ${code} सांगा.`,
  friendMessage: (code, company) =>
    `नमस्कार ${company}, मला घरासाठी सोलर बसवायचा आहे. माझा रेफरल कोड ${code} आहे.`,
  totals: {
    earned: 'मिळाले',
    pending: 'मंजुरीची वाट',
    approved: 'मंजूर',
    paid: 'तुम्हाला दिले',
  },
  reward: {
    pending: 'बक्षीस बाकी',
    approved: 'बक्षीस मंजूर',
    paid: 'बक्षीस दिले',
    rejected: 'पात्र नाही',
  },
  rewardAmount: (amount) => `बक्षीस ${amount}`,
  rewardPaidOn: (amount, date) => `${amount}, ${date} ला दिले`,
};

export const FEEDBACK: Copy<typeof en.FEEDBACK> = {
  title: 'तुमचा अनुभव सांगा',
  intro: 'पहिल्या भेटीपासून सिस्टिम सुरू होईपर्यंत आमच्यासोबतचा तुमचा सोलर प्रवास कसा होता?',
  ratingLabel: 'तुमचे रेटिंग',
  stars: STARS,
  commentLabel: 'अजून सांगा',
  commentHint: DO_BETTER,
  submit: 'रेटिंग पाठवा',
  sent: 'रेटिंगबद्दल धन्यवाद.',
  pickRating: 'आधी रेटिंग निवडा.',
};
