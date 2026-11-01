/**
 * Hindi copy for help requests, referrals and the overall rating: the same shape as
 * `../en/care.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import { type Copy, lookup } from '@/i18n/copy';
import type * as en from '../en/care';

/** The kinds of problem OneOhm ships with; ones the team added keep their own name. */
const CATEGORIES = {
  no_generation: 'सोलर से बिजली नहीं बन रही',
  low_generation: 'रोज़ से कम बिजली',
  inverter_error: 'इन्वर्टर में एरर या अलार्म',
  physical_damage: 'पैनल या वायरिंग में नुकसान',
  cleaning: 'पैनल की सफ़ाई',
  billing_net_meter: 'बिजली बिल या नेट मीटर',
  subsidy: 'सब्सिडी के बारे में सवाल',
  other: 'कुछ और',
  maintenance_visit: 'मेंटेनेंस विज़िट',
};

type ReferEvent = 'project_created' | 'advance_paid' | 'commissioned';
const WHEN_FRIEND: Readonly<Record<ReferEvent, string>> = {
  project_created: 'आपके दोस्त के सोलर प्रोजेक्ट बुक करने पर',
  advance_paid: 'आपके दोस्त के एडवांस भरने पर',
  commissioned: 'आपके दोस्त का सिस्टम चालू होने पर',
};

const STARS = ['खराब', 'और अच्छा हो सकता था', 'अच्छा', 'बहुत अच्छा', 'शानदार'] as const;
const DO_BETTER = 'क्या अच्छा रहा, और हम क्या बेहतर कर सकते थे?';

export const SUPPORT: Copy<typeof en.SUPPORT> = {
  title: 'मदद',
  intro: 'सिस्टम में कोई दिक्कत है? हमें बताएँ, हमारी सर्विस टीम आपको फ़ोन करेगी।',
  loading: 'आपकी रिक्वेस्ट लोड हो रही हैं',
  newRequest: 'मदद माँगें',
  formTitle: 'किस चीज़ में मदद चाहिए?',
  formDescription: 'सबसे मिलता-जुलता चुनें और थोड़ा बताएँ।',
  categoryLabel: 'दिक्कत किस तरह की है',
  projectLabel: 'कौन-सा सिस्टम',
  descriptionLabel: 'क्या हो रहा है?',
  descriptionHint: 'जैसे: आज सुबह से इन्वर्टर पर लाल बत्ती जल रही है।',
  submit: 'OneOhm को भेजें',
  sent: 'भेज दिया। हमारी सर्विस टीम आपको फ़ोन करेगी।',
  historyTitle: 'आपकी रिक्वेस्ट',
  emptyTitle: 'अभी कोई रिक्वेस्ट नहीं',
  emptyBody: 'सिस्टम में कुछ भी गड़बड़ हो तो यहाँ मदद माँगें।',
  status: { open: 'मिल गई', in_progress: 'काम चल रहा है', resolved: 'हल हो गई' },
  raisedOn: (date) => `${date} को की`,
  resolution: 'हमने क्या किया',
  photosLabel: 'फ़ोटो',
  photosHint: 'ज़रूरी नहीं। इन्वर्टर की स्क्रीन या पैनल की फ़ोटो हो तो हम तैयारी से आएँगे।',
  takePhoto: 'फ़ोटो लें',
  choosePhotos: 'फ़ोटो चुनें',
  removePhoto: 'फ़ोटो हटाएँ',
  photoCount: (count) => `${count} फ़ोटो`,
  photosFailed: (count) =>
    count === 1
      ? 'भेज दिया, पर 1 फ़ोटो अपलोड नहीं हो पाई।'
      : `भेज दिया, पर ${count} फ़ोटो अपलोड नहीं हो पाईं।`,
  cameraDenied: 'फ़ोटो लेने के लिए फ़ोन की सेटिंग में कैमरे की अनुमति दें।',
  libraryDenied: 'फ़ोटो जोड़ने के लिए फ़ोन की सेटिंग में फ़ोटो की अनुमति दें।',
  category: (key, label) => lookup(CATEGORIES, key) ?? label,
};

export const REFER: Copy<typeof en.REFER> = {
  title: 'पड़ोसी को बताएँ',
  intro: 'किसी को बिजली का बिल कम करना है? उनका नंबर दें, हमारी टीम उन्हें फ़ोन करेगी।',
  nameLabel: 'उनका नाम',
  phoneLabel: 'उनका मोबाइल नंबर',
  cityLabel: 'गाँव या शहर',
  noteLabel: 'हमें कुछ और बताना है?',
  submit: 'नाम भेजें',
  sent: 'धन्यवाद! हम उन्हें जल्द फ़ोन करेंगे।',
  historyTitle: 'आपके बताए लोग',
  emptyBody: 'आपके बताए लोग और उनका काम कहाँ तक पहुँचा, यहाँ दिखेगा।',
  status: {
    received: 'मिल गया',
    in_progress: 'OneOhm से बात चल रही है',
    ordered: 'सोलर लगवा रहे हैं',
    installed: 'सोलर लग गया',
    closed: 'बंद',
  },
  referredOn: (date) => `${date} को बताया`,
  codeTitle: 'आपका रेफ़रल कोड',
  codeLabel: (code) => `आपका रेफ़रल कोड ${code} है`,
  codeHint: 'दोस्त WhatsApp पर या हमारी टीम के फ़ोन करने पर यह कोड बताएँ।',
  terms: (amount, event) => `${WHEN_FRIEND[event]} आपको ${amount} मिलेंगे।`,
  termsPerKw: (amount, event) => `${WHEN_FRIEND[event]} उनके हर kW के लिए आपको ${amount} मिलेंगे।`,
  termsOff: 'सोलर चाहने वाले किसी को भी अपना कोड दें। हम उन्हें फ़ोन करेंगे और आपको बताते रहेंगे।',
  approvalNote: 'हर इनाम OneOhm मंज़ूर करता है, फिर आपको देता है।',
  shareWhatsApp: 'WhatsApp पर भेजें',
  shareOther: 'दूसरे तरीके से भेजें',
  shareFailed: 'शेयर नहीं खुला। अपने दोस्त को कोड बता दें।',
  shareText: (code, link) =>
    link
      ? `मैंने OneOhm से सोलर लगवाया और मेरा बिजली बिल कम हो गया। आपको भी सोलर चाहिए? मेरे रेफ़रल कोड ${code} के साथ OneOhm को WhatsApp करें: ${link}`
      : `मैंने OneOhm से सोलर लगवाया और मेरा बिजली बिल कम हो गया। आपको भी सोलर चाहिए? OneOhm को फ़ोन करें और मेरा रेफ़रल कोड ${code} बताएँ।`,
  friendMessage: (code) => `नमस्ते OneOhm, मुझे अपने घर के लिए सोलर चाहिए। मेरा रेफ़रल कोड ${code} है।`,
  totals: {
    earned: 'कमाए',
    pending: 'मंज़ूरी का इंतज़ार',
    approved: 'मंज़ूर',
    paid: 'आपको दिए',
  },
  reward: {
    pending: 'इनाम बाकी',
    approved: 'इनाम मंज़ूर',
    paid: 'इनाम दिया',
    rejected: 'योग्य नहीं',
  },
  rewardAmount: (amount) => `इनाम ${amount}`,
  rewardPaidOn: (amount, date) => `${amount}, ${date} को दिए`,
};

export const FEEDBACK: Copy<typeof en.FEEDBACK> = {
  title: 'अपना अनुभव बताएँ',
  intro: 'पहली विज़िट से सिस्टम चालू होने तक, OneOhm के साथ आपकी सोलर यात्रा कैसी रही?',
  ratingLabel: 'आपकी रेटिंग',
  stars: STARS,
  commentLabel: 'और बताएँ',
  commentHint: DO_BETTER,
  submit: 'रेटिंग भेजें',
  sent: 'रेटिंग के लिए धन्यवाद।',
  pickRating: 'पहले रेटिंग चुनें।',
};
