import { localized, type Words } from './language';

/** WhatsApp keeps a list row's title to 24 characters. */
export const ROW_TITLE_LIMIT = 24;

/** The longest form of a title that fits a list row; the shorter forms come after it. */
const fit = (...forms: string[]) =>
  forms.find((form) => form.length <= ROW_TITLE_LIMIT) ??
  `${(forms.at(-1) ?? '').slice(0, ROW_TITLE_LIMIT - 1)}…`;

/**
 * The Documents answer (live QA round 2): a list of the customer's papers in plain words
 * (no codes), and each tapped paper sent as the file itself with a short caption. Codes
 * stay in the captions and the PDFs. Row titles keep 24 characters.
 */
const EN_PAPERS = {
  pick: 'Which paper would you like? Tap one and I will send it here as a file.',
  more: 'For older papers, ask us here.',
  button: 'Choose a paper',
  back: 'Back to menu',
  quote: 'Your quotation',
  quoteSent: (revised: boolean, day: string) => `${revised ? 'Revised, sent' : 'Sent'} ${day}`,
  receipt: (instalment: string) => fit(`Receipt · ${instalment}`, `${instalment} receipt`),
  plainReceipt: 'Payment receipt',
  invoice: 'Tax invoice',
  paper: (name: string) => fit(name),
  paid: (amount: string, day: string) => `${amount} · paid ${day}`,
  invoiceCaption: (number: string) => `Your tax invoice (${number})`,
};

const MR_PAPERS: Words<typeof EN_PAPERS> = {
  pick: 'कोणते कागदपत्र हवे आहे? एक निवडा, मी ते इथे फाईल म्हणून पाठवतो.',
  more: 'जुन्या कागदपत्रांसाठी आम्हाला इथे विचारा.',
  button: 'कागदपत्र निवडा',
  back: 'मेनूवर परत',
  quote: 'तुमचे कोटेशन',
  quoteSent: (revised, day) => `${revised ? 'सुधारित, ' : ''}${day} रोजी पाठवले`,
  receipt: (instalment) => fit(`पावती · ${instalment}`, `${instalment} पावती`),
  plainReceipt: 'पेमेंट पावती',
  invoice: 'टॅक्स इनव्हॉइस',
  paper: (name) => fit(name),
  paid: (amount, day) => `${amount} · ${day} रोजी भरले`,
  invoiceCaption: (number) => `तुमचे टॅक्स इनव्हॉइस (${number})`,
};

const HI_PAPERS: Words<typeof EN_PAPERS> = {
  pick: 'कौन सा दस्तावेज़ चाहिए? एक चुनें, मैं उसे यहाँ फ़ाइल की तरह भेज दूँगा।',
  more: 'पुराने दस्तावेज़ों के लिए हमसे यहाँ पूछें।',
  button: 'दस्तावेज़ चुनें',
  back: 'मेनू पर वापस',
  quote: 'आपका कोटेशन',
  quoteSent: (revised, day) => `${revised ? 'संशोधित, ' : ''}${day} को भेजा`,
  receipt: (instalment) => fit(`रसीद · ${instalment}`, `${instalment} रसीद`),
  plainReceipt: 'पेमेंट रसीद',
  invoice: 'टैक्स इनवॉइस',
  paper: (name) => fit(name),
  paid: (amount, day) => `${amount} · ${day} को भरे`,
  invoiceCaption: (number) => `आपका टैक्स इनवॉइस (${number})`,
};

/** Every language, for the checks. */
export const PAPER_LISTS = { en: EN_PAPERS, mr: MR_PAPERS, hi: HI_PAPERS };
export const PAPER_WORDS = localized(EN_PAPERS, { mr: MR_PAPERS, hi: HI_PAPERS });
