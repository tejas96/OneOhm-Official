import { fitTitle } from './chat-words';
import { localized, type Words } from './language';

/** WhatsApp keeps a list row's title to 24 characters. */
export const ROW_TITLE_LIMIT = 24;

/** The longest form of a title that fits a list row; the shorter forms come after it. */
const fit = (...forms: string[]) =>
  forms.find((form) => form.length <= ROW_TITLE_LIMIT) ??
  fitTitle(forms.at(-1) ?? '', ROW_TITLE_LIMIT);

/**
 * The Documents answer (live QA round 2): a list of the customer's papers in plain words
 * (no codes), and each tapped paper sent as the file itself with a short caption. Codes
 * stay in the captions and the PDFs. Row titles keep 24 characters.
 */
const EN_PAPERS = {
  pick: 'Which paper would you like? Tap one and we send it here as a file.',
  gone: 'That paper is not available any more — here is the latest list.',
  none: 'No receipts yet.',
  more: 'For older papers, ask us here.',
  button: 'Choose a paper',
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
  pick: 'कोणते कागदपत्र हवे आहे? एक निवडा, आम्ही ते इथे फाईल म्हणून पाठवू.',
  gone: 'ते कागदपत्र आता उपलब्ध नाही — ही सध्याची यादी आहे.',
  none: 'अजून पावत्या नाहीत.',
  more: 'जुन्या कागदपत्रांसाठी आम्हाला इथे विचारा.',
  button: 'कागदपत्र निवडा',
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
  pick: 'कौन सा दस्तावेज़ चाहिए? एक चुनें, हम उसे यहाँ फ़ाइल की तरह भेज देंगे।',
  gone: 'वह दस्तावेज़ अब उपलब्ध नहीं है — यह ताज़ा सूची है।',
  none: 'अभी कोई रसीद नहीं है।',
  more: 'पुराने दस्तावेज़ों के लिए हमसे यहाँ पूछें।',
  button: 'दस्तावेज़ चुनें',
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
