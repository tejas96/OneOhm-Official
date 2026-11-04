import { localized, type Words } from './language';

/**
 * The thank-you after the customer accepts a quote on WhatsApp (kept here because
 * `words.ts` is full). It promises what B1 makes true: the project manager starts the
 * project, with the advance link, the same or the next working day.
 */
const EN_QUOTE = {
  quoteThanks:
    'Thank you. Your project manager will start your project and send the advance payment link today (or the next working day).',
  /** A second "Yes, accept", or "Accept quote" on a quote accepted before (menu audit H4). */
  alreadyAccepted: 'This quote is already accepted. Thank you!',
};

const MR_QUOTE: Words<typeof EN_QUOTE> = {
  quoteThanks:
    'धन्यवाद. तुमचे प्रोजेक्ट मॅनेजर आज (किंवा पुढच्या कामाच्या दिवशी) तुमचा प्रकल्प सुरू करतील आणि आगाऊ रकमेची पेमेंट लिंक पाठवतील.',
  alreadyAccepted: 'हे कोटेशन आधीच स्वीकारले आहे. धन्यवाद!',
};

const HI_QUOTE: Words<typeof EN_QUOTE> = {
  quoteThanks:
    'धन्यवाद। आपके प्रोजेक्ट मैनेजर आज (या अगले कामकाजी दिन) आपका प्रोजेक्ट शुरू करेंगे और एडवांस पेमेंट लिंक भेजेंगे।',
  alreadyAccepted: 'यह कोटेशन पहले ही स्वीकार हो चुका है। धन्यवाद!',
};

/** Every language, for the checks. */
export const QUOTE_LISTS = { en: EN_QUOTE, mr: MR_QUOTE, hi: HI_QUOTE };

export const QUOTE_WORDS = localized(EN_QUOTE, { mr: MR_QUOTE, hi: HI_QUOTE });
