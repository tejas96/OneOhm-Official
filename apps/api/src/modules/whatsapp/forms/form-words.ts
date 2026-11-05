import { localized, type Words } from '../assistant/language';
import { SEND_PAPER_SCREEN } from './send-paper.flow';

/**
 * Words of the "Send a paper" form, in the customer's language: the message beside the
 * form button, and the words filled into the form screen itself. Meta's limits: the button
 * 30 characters (no emoji), the heading and picker label 80, the hint 300, the Send
 * button 35 (form-words.test.ts checks them in every language).
 */
const EN_FORM = {
  button: 'Send paper',
  body: (paper: string, home: string | null) =>
    `Please send your *${paper}*${home ? ` for ${home}` : ''}.\nTap the button, add up to 4 photos (or a PDF), then Send.\n\nOr just send the photo here.`,
  heading: (paper: string, home: string | null) => (home ? `${paper} — ${home}` : paper),
  photosLabel: 'Photos',
  photosHint: 'Take or choose up to 4 photos. Use more than one for the front and back.',
  pdfLink: 'Have a PDF instead?',
  pdfLabel: 'PDF',
  pdfHint: 'Add up to 2 PDFs.',
  send: 'Send',
  old: 'That form is old — please try again.',
  noFile: "We didn't get the file — please send the photo here.",
  whatToSend: 'What do you want to send?',
};

const MR_FORM: Words<typeof EN_FORM> = {
  button: 'कागद पाठवा',
  body: (paper, home) =>
    `कृपया तुमचा *${paper}*${home ? ` (${home})` : ''} पाठवा.\nबटण दाबा, ४ फोटो (किंवा PDF) जोडा, मग पाठवा.\n\nकिंवा फोटो इथेच पाठवा.`,
  heading: (paper, home) => (home ? `${paper} — ${home}` : paper),
  photosLabel: 'फोटो',
  photosHint: '४ पर्यंत फोटो काढा किंवा निवडा. पुढची आणि मागची बाजू असल्यास एकापेक्षा जास्त जोडा.',
  pdfLink: 'PDF आहे का?',
  pdfLabel: 'PDF',
  pdfHint: '२ पर्यंत PDF जोडा.',
  send: 'पाठवा',
  old: 'तो फॉर्म जुना झाला आहे — कृपया पुन्हा प्रयत्न करा.',
  noFile: 'आम्हाला फाइल मिळाली नाही — कृपया फोटो इथेच पाठवा.',
  whatToSend: 'तुम्हाला काय पाठवायचे आहे?',
};

const HI_FORM: Words<typeof EN_FORM> = {
  button: 'कागज़ भेजें',
  body: (paper, home) =>
    `कृपया अपना *${paper}*${home ? ` (${home})` : ''} भेजें।\nबटन दबाएँ, 4 तक फ़ोटो (या PDF) जोड़ें, फिर भेजें।\n\nया फ़ोटो यहीं भेज दें।`,
  heading: (paper, home) => (home ? `${paper} — ${home}` : paper),
  photosLabel: 'फ़ोटो',
  photosHint: '4 तक फ़ोटो खींचें या चुनें। आगे और पीछे दोनों हों तो एक से ज़्यादा जोड़ें।',
  pdfLink: 'PDF भेजना है?',
  pdfLabel: 'PDF',
  pdfHint: '2 तक PDF जोड़ें।',
  send: 'भेजें',
  old: 'वह फ़ॉर्म पुराना हो गया है — कृपया फिर से कोशिश करें।',
  noFile: 'हमें फ़ाइल नहीं मिली — कृपया फ़ोटो यहीं भेज दें।',
  whatToSend: 'आप क्या भेजना चाहते हैं?',
};

/** Every language, for the checks. */
export const FORM_LISTS = { en: EN_FORM, mr: MR_FORM, hi: HI_FORM };
export const FORM_WORDS = localized(EN_FORM, { mr: MR_FORM, hi: HI_FORM });

/** Meta's limits for what goes into the form screen and its message. */
export const FORM_LIMITS = {
  button: 30,
  heading: 80,
  label: 80,
  hint: 300,
  send: 35,
  link: 25,
  body: 1024,
};

/** The words that fill the form screens (their start `data`). */
export function sendPaperData(paper: string, home: string | null) {
  return {
    heading: FORM_WORDS.heading(paper, home).slice(0, FORM_LIMITS.heading),
    photos_label: FORM_WORDS.photosLabel,
    photos_hint: FORM_WORDS.photosHint,
    pdf_link: FORM_WORDS.pdfLink,
    pdf_label: FORM_WORDS.pdfLabel,
    pdf_hint: FORM_WORDS.pdfHint,
    send: FORM_WORDS.send,
  };
}

/** The start of a "Send a paper" form for this paper: its message, button and screen words. */
export function sendPaperStart(
  paper: string,
  home: string | null,
  payload: Record<string, unknown>,
) {
  return {
    body: FORM_WORDS.body(paper, home),
    button: FORM_WORDS.button,
    screen: SEND_PAPER_SCREEN,
    data: sendPaperData(paper, home),
    payload,
  };
}
