import { localized, type Words } from './language';

/**
 * The thank-you after the customer accepts a quote on WhatsApp (kept here because
 * `words.ts` is full). It promises what B1 makes true: the project manager starts the
 * project, with the advance link, the same or the next working day.
 */
const EN_QUOTE = {
  quoteThanks: (name: string) =>
    `Thank you ✅ ${name} will start your project and send the advance payment link today (or the next working day).`,
  /** A family number tapped Accept (redesign §2.4): only the customer's own number can. */
  ownerOnly: (customer: string) => `Only ${customer}'s own number can accept this quote.`,
  /** When nobody looks after the customer yet. */
  team: 'Our team',
  /** A second "Yes, accept", or "Accept quote" on a quote accepted before (menu audit H4). */
  alreadyAccepted: 'This quote is already accepted. Thank you!',
};

const MR_QUOTE: Words<typeof EN_QUOTE> = {
  quoteThanks: (name) =>
    `धन्यवाद ✅ ${name} आज (किंवा पुढच्या कामाच्या दिवशी) तुमचा प्रकल्प सुरू करतील आणि आगाऊ रकमेची पेमेंट लिंक पाठवतील.`,
  ownerOnly: (customer) => `हे कोटेशन फक्त ${customer} यांच्या स्वतःच्या नंबरवरून स्वीकारता येते.`,
  team: 'आमची टीम',
  alreadyAccepted: 'हे कोटेशन आधीच स्वीकारले आहे. धन्यवाद!',
};

const HI_QUOTE: Words<typeof EN_QUOTE> = {
  quoteThanks: (name) =>
    `धन्यवाद ✅ ${name} आज (या अगले कामकाजी दिन) आपका प्रोजेक्ट शुरू करेंगे और एडवांस पेमेंट लिंक भेजेंगे।`,
  ownerOnly: (customer) => `यह कोटेशन सिर्फ़ ${customer} के अपने नंबर से स्वीकार हो सकता है।`,
  team: 'हमारी टीम',
  alreadyAccepted: 'यह कोटेशन पहले ही स्वीकार हो चुका है। धन्यवाद!',
};

/** Every language, for the checks. */
export const QUOTE_LISTS = { en: EN_QUOTE, mr: MR_QUOTE, hi: HI_QUOTE };

export const QUOTE_WORDS = localized(EN_QUOTE, { mr: MR_QUOTE, hi: HI_QUOTE });
