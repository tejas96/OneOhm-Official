import { homeEn, homeHi, homeMr } from '@oneohm/shared';
import { localized, type Words } from '../assistant/language';
import { PAID_SCREEN } from './paid-another-way.flow';

/**
 * Words of the "I paid another way" form, in the customer's language: the message beside the
 * form button and the words filled into the screen. Meta's limits are the same as the paper
 * form's (button 30, heading and labels 80, hint 300, Send 35); paid-words.test.ts checks them.
 */
const EN_PAID = {
  button: 'Send payment proof',
  body: (amount: string, home: string) =>
    `Thanks for telling us. Please add the details of your *${amount}* payment for your ${homeEn(home)}.\nTap the button, then Send.\n\nOr just send the photo of the proof here.`,
  heading: (amount: string, home: string) => `${amount} — ${home}`,
  amountLabel: 'Amount paid (₹)',
  amountHint: (amount: string) => `Amount due: ${amount}`,
  dateLabel: 'Date paid',
  photosLabel: 'Proof of payment',
  photosHint: 'A screenshot or a photo of the receipt.',
  send: 'Send',
};

const MR_PAID: Words<typeof EN_PAID> = {
  button: 'पुरावा पाठवा',
  body: (amount, home) =>
    `सांगितल्याबद्दल धन्यवाद. तुमच्या ${homeMr(home, 'घराच्या')} *${amount}* पेमेंटची माहिती द्या.\nबटण दाबा, मग पाठवा.\n\nकिंवा पुराव्याचा फोटो इथेच पाठवा.`,
  heading: (amount, home) => `${amount} — ${home}`,
  amountLabel: 'भरलेली रक्कम (₹)',
  amountHint: (amount) => `बाकी रक्कम: ${amount}`,
  dateLabel: 'भरल्याची तारीख',
  photosLabel: 'पेमेंटचा पुरावा',
  photosHint: 'स्क्रीनशॉट किंवा पावतीचा फोटो.',
  send: 'पाठवा',
};

const HI_PAID: Words<typeof EN_PAID> = {
  button: 'सबूत भेजें',
  body: (amount, home) =>
    `बताने के लिए धन्यवाद। अपने ${homeHi(home)} के *${amount}* पेमेंट की जानकारी दें।\nबटन दबाएँ, फिर भेजें।\n\nया सबूत की फ़ोटो यहीं भेज दें।`,
  heading: (amount, home) => `${amount} — ${home}`,
  amountLabel: 'चुकाई गई रकम (₹)',
  amountHint: (amount) => `बाकी रकम: ${amount}`,
  dateLabel: 'भुगतान की तारीख़',
  photosLabel: 'भुगतान का सबूत',
  photosHint: 'स्क्रीनशॉट या रसीद की फ़ोटो।',
  send: 'भेजें',
};

export const PAID_LISTS = { en: EN_PAID, mr: MR_PAID, hi: HI_PAID };
export const PAID_WORDS = localized(EN_PAID, { mr: MR_PAID, hi: HI_PAID });

/** The start of the "I paid another way" form: message, button, screen and the words in it. */
export function paidAnotherWayStart(
  amount: string,
  home: string,
  payload: Record<string, unknown>,
) {
  return {
    body: PAID_WORDS.body(amount, home),
    button: PAID_WORDS.button,
    screen: PAID_SCREEN,
    data: {
      heading: PAID_WORDS.heading(amount, home).slice(0, 80),
      amount_label: PAID_WORDS.amountLabel,
      amount_hint: PAID_WORDS.amountHint(amount),
      date_label: PAID_WORDS.dateLabel,
      photos_label: PAID_WORDS.photosLabel,
      photos_hint: PAID_WORDS.photosHint,
      send: PAID_WORDS.send,
    },
    payload,
  };
}
