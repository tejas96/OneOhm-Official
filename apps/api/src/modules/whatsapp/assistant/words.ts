import { localized } from './language';
import { HI } from './words-hi';
import { MR } from './words-mr';

/**
 * What the WhatsApp assistant says (PRD 6.1), in plain words. Row titles stay within
 * WhatsApp's limits: 24 characters for list rows and 20 for buttons.
 */
const EN_MENU_ROWS = [
  { id: 'progress', title: 'Project progress', description: 'Where your solar work stands' },
  { id: 'payments', title: 'Payments', description: 'Paid, due and a link to pay' },
  { id: 'documents', title: 'Documents', description: 'Quotation, invoices, receipts, papers' },
  { id: 'service', title: 'Report a problem', description: 'Raise a service request' },
  { id: 'requests', title: 'My requests', description: 'Status of service requests' },
  { id: 'warranty', title: 'Warranty and AMC', description: 'Your equipment and cover' },
  { id: 'refer', title: 'Refer a friend', description: 'Tell friends, earn rewards' },
  { id: 'rewards', title: 'My rewards', description: 'Your referrals and rewards' },
  { id: 'feedback', title: 'Rate us', description: 'Tell us how we did' },
  { id: 'human', title: 'Talk to a person', description: 'A team member replies here' },
] as const;

export type MenuChoice = (typeof EN_MENU_ROWS)[number]['id'];

const EN_WORDS = {
  menu: (name: string, company: string) =>
    `Hello ${name}! I am the ${company ? `${company} ` : ''}assistant. What would you like to see?`,
  menuButton: 'Choose',
  unknownNumber:
    'Hello! This number is not linked to any of our customers yet. If you are interested in solar, tap "Call me back". If you are a customer with another number, please write from that number.',
  callMeBack: 'Call me back',
  callbackNoted: 'Thank you! Someone from our team will call you soon.',
  noProject: 'We do not have a project for you yet. Tap "Talk to us" to speak to us.',
  stage: {
    survey: 'Site visit',
    design: 'System design',
    material: 'Equipment',
    installation: 'Installation',
    commissioning: 'Switch-on',
    net_metering: 'Net meter',
    subsidy: 'Subsidy',
  } as Record<string, string>,
  subsidy: {
    not_applicable: 'No subsidy on this project.',
    pending: 'Subsidy: not applied yet',
    applied: 'Subsidy: applied, waiting for the government',
    inspected: 'Subsidy: inspection done, waiting for the release',
    released: 'Subsidy: released',
  } as Record<string, string>,
  waitingOn: {
    customer: 'Waiting for something from you',
    bank: 'Waiting for the bank',
    discom: 'Waiting for the electricity board (DISCOM)',
  } as Record<string, string>,
  allPaid: 'Everything is paid. Thank you!',
  payHere: 'Pay here',
  payNow: 'Pay now',
  noDocuments: 'No documents yet. They will appear here as your project moves.',
  askProblem:
    'Please tell us the problem in one message (for example "inverter shows an error since morning"). You can send a photo with a caption.',
  problemSaved: (category: string) =>
    `Thank you. Your ${category} request is raised. Our team will call you. Tap "My requests" to see its status.`,
  tooShort: 'Please write a few more words so we can help.',
  noRequests: 'You have no service requests.',
  askReferral:
    'Send your friend\'s name and 10-digit mobile number in one message, for example "Suresh Patil 9876543210".',
  referralSaved: (name: string) =>
    `Thank you! We will call ${name}. You earn a reward when their solar is installed.`,
  referralKnown: 'We are already in touch with this number. Thank you for thinking of us!',
  referralUnclear: 'I could not find a name and a 10-digit mobile number. Please try again.',
  referredWelcome: (referrer: string, company: string) =>
    `Welcome${company ? ` to ${company}` : ''}! ${referrer} referred you. Our team will call you on this number soon to plan your solar.`,
  askRating: 'How happy are you with us so far?',
  ratingSaved: 'Thank you for rating us! It helps the team.',
  humanSoon:
    'A team member will reply here soon (Monday to Saturday, 9:30 am to 6:30 pm). Tap "Menu" to go back to the assistant.',
  notUnderstood: 'Sorry, I did not get that. Here is what I can help with.',
  /** The answer to a short thanks or ack (review F7). */
  welcome: 'You’re welcome 🙏',
  /** A reply to one of our updates goes to their person, with this warm note. */
  passedToOwner: (name: string | null) =>
    `Thank you. ${name ?? 'Our team'} will reply to you here.`,
  /** Once a night, when a person has the chat and it is outside working hours. */
  nightReply: (name: string | null) =>
    `Thank you. We reply from 9:30 am to 6:30 pm. Your message is with ${name ?? 'our team'}.`,
  /** The buttons of the check before an accept binds (its words: quote-money-words). */
  quoteYes: 'Yes, accept',
  quoteNotYet: 'Not yet',
  quoteChanged: 'This quote has changed or is no longer open.',
  quoteOwnerOnly: 'Only the customer’s own number can accept a quote.',
} as const;

const EN_RATINGS = [
  { id: 'rate:5', title: 'Very happy', description: '5 of 5' },
  { id: 'rate:4', title: 'Happy', description: '4 of 5' },
  { id: 'rate:3', title: 'Okay', description: '3 of 5' },
  { id: 'rate:2', title: 'Not happy', description: '2 of 5' },
  { id: 'rate:1', title: 'Very unhappy', description: '1 of 5' },
] as const;

/** Photos and papers the customer sends (PRD 6.1). */
const EN_MEDIA_WORDS = {
  what: { image: 'photo', document: 'paper', video: 'video', audio: 'voice note' },
  ask: (what: string) =>
    `Thank you, we got your ${what}. Is it about a problem with your solar system?`,
  reportProblem: 'Report a problem',
  talkToPerson: 'Talk to a person',
  paperSaved: (title: string) =>
    `Thank you! We got your ${title}. It is saved with your documents and the team is told.`,
  stillNeed: (titles: string) => `We still need: ${titles}. Send it here when you have it.`,
  paperRefused: (title: string) =>
    `Sorry, we could not use that file for your ${title}. Please send a clear photo or a PDF.`,
  photoAdded: 'Thank you, the photo is added to your request.',
  photoNotAdded: 'We could not add the file to the request. Please send a photo of the problem.',
  photoOnly: 'Photo or paper sent on WhatsApp.',
  tooLarge: 'This file is too large. Please send a smaller photo or PDF.',
  failed: 'Sorry, we could not open that file. Please send it again in a little while.',
  whichHome: 'Which home is this for?',
  personRow: 'Aadhaar/PAN (all homes)',
  savedFor: (kind: string, home: string) => `Saved: *${kind}* for your home at *${home}*.`,
  stillNeeded: (list: string) => `Still needed for this home: ${list}.`,
  problemSavedWithPhotos: (category: string, photos: number) =>
    `Thank you. Your ${category} request is raised with your ${photos === 1 ? 'photo' : `${photos} photos`}. Our team will call you. Tap "My requests" to see its status.`,
} as const;

/** The "Warranty and AMC" answer, the same cover the app shows (PRD 5.5). */
const EN_COVER_WORDS = {
  notYet: 'Your warranties start on the day your system is switched on. They will show here then.',
  since: (date: string) => `Switched on ${date}. Cover counts from that day.`,
  kinds: {
    panel: 'Solar panels',
    inverter: 'Inverter',
    battery: 'Battery',
    structure: 'Mounting structure',
    workmanship: 'Installation work',
  } as Record<string, string>,
  item: (kind: string, length: string, until: string) => `• ${kind}: ${length}, until ${until}`,
  ended: (kind: string, until: string) => `• ${kind}: warranty ended on ${until}`,
  performance: (date: string) => `  Power output guaranteed until ${date}`,
  years: (count: number) => (count === 1 ? '1 year' : `${count} years`),
  months: (count: number) => (count === 1 ? '1 month' : `${count} months`),
  amc: (plan: string, state: string, from: string, to: string) =>
    `AMC: ${plan} (${state}), ${from} to ${to}`,
  amcState: { upcoming: 'starts soon', active: 'active', ended: 'ended', cancelled: 'cancelled' },
  amcVisits: (done: number, total: number) => `${done} of ${total} visits done`,
  nextVisit: (name: string, date: string) => `Next ${name} visit: ${date}`,
  noAmc: 'AMC: none yet. For yearly cleaning and check-up visits, tap "Talk to us".',
  help: 'For a problem with any of these, tap "Report a problem" in the menu.',
} as const;

/** "My rewards": the people the customer referred and what they earned (PRD 5.6). */
const EN_REWARD_WORDS = {
  none: 'You have not referred anyone yet. Tap "Refer a friend" to tell your friends about us. You earn a reward when their solar is installed.',
  title: '*Your referrals*',
  status: {
    received: 'we will call them soon',
    in_progress: 'we are talking to them',
    ordered: 'they ordered solar',
    installed: 'their solar is installed',
    closed: 'did not go ahead',
  },
  reward: {
    pending: (amount: string) => `reward ${amount}, waiting for approval`,
    approved: (amount: string) => `reward ${amount}, approved and paying soon`,
    paid: (amount: string, date: string | null) =>
      `reward ${amount}, paid${date ? ` on ${date}` : ''}`,
    rejected: (_amount: string) => 'no reward on this one',
  },
  paidTotal: (amount: string) => `Paid to you: ${amount}`,
  comingTotal: (amount: string) => `On the way: ${amount}`,
  more: (count: number) => `And ${count} more.`,
} as const;

/** Rating OneOhm on WhatsApp (PRD 6.1), asked only once the system is switched on. */
const EN_FEEDBACK_WORDS = {
  later: 'Thank you! We will ask for your rating once your solar system is switched on.',
  askComment: 'Thank you for rating us! Anything to add? Write it here, or tap "Menu".',
  commentSaved: 'Thank you, we have noted it. It helps the team do better.',
  skipWords: ['skip', 'no', 'nothing', 'no thanks', 'none', 'nahi', 'nako'] as readonly string[],
} as const;

/** Lines in the progress, payments and requests answers. */
const EN_ANSWER_WORDS = {
  now: (stage: string, done: number, steps: number) =>
    `Now: ${stage} (${done} of ${steps} steps done)`,
  allDone: (steps: number) => `All ${steps} steps done. Your solar system is complete.`,
  next: (title: string, when: string) => `Next: ${title}, planned ${when}`,
  waitingSince: (who: string, when: string) => `${who} since ${when}`,
  paid: (label: string, amount: string) => `✓ ${label}: ${amount} paid`,
  bank: (label: string, amount: string) => `• ${label}: ${amount} (bank loan)`,
  later: (label: string, amount: string) => `• ${label}: ${amount} later`,
  due: (label: string, amount: string) => `• ${label}: ${amount} due`,
  requestStatus: { open: 'Open', in_progress: 'Being worked on', resolved: 'Resolved' },
  technicianVisit: (when: string) => `Technician visit: ${when}`,
} as const;

/** The kind of problem, in the customer's words, for "Your … request is raised". */
const EN_CATEGORY_WORDS = {
  inverter_error: 'inverter',
  no_generation: 'no generation',
  low_generation: 'low generation',
  physical_damage: 'damage',
  cleaning: 'cleaning',
  billing_net_meter: 'bill or meter',
  subsidy: 'subsidy',
  other: 'service',
} as Record<string, string>;

export const EN = {
  MENU_ROWS: EN_MENU_ROWS,
  WORDS: EN_WORDS,
  RATINGS: EN_RATINGS,
  MEDIA_WORDS: EN_MEDIA_WORDS,
  COVER_WORDS: EN_COVER_WORDS,
  REWARD_WORDS: EN_REWARD_WORDS,
  FEEDBACK_WORDS: EN_FEEDBACK_WORDS,
  ANSWER_WORDS: EN_ANSWER_WORDS,
  CATEGORY_WORDS: EN_CATEGORY_WORDS,
};
export type AssistantWords = typeof EN;

const pick = <K extends keyof AssistantWords>(key: K) =>
  localized(EN[key], { mr: MR[key], hi: HI[key] });

export const MENU_ROWS = pick('MENU_ROWS');
export const WORDS = pick('WORDS');
export const RATINGS = pick('RATINGS');
export const MEDIA_WORDS = pick('MEDIA_WORDS');
export const COVER_WORDS = pick('COVER_WORDS');
export const REWARD_WORDS = pick('REWARD_WORDS');
export const FEEDBACK_WORDS = pick('FEEDBACK_WORDS');
export const ANSWER_WORDS = pick('ANSWER_WORDS');
export const CATEGORY_WORDS = pick('CATEGORY_WORDS');

/** Menu rows in every language, so a typed title works whatever language is set. */
export const ALL_MENU_ROWS = [...EN_MENU_ROWS, ...MR.MENU_ROWS, ...HI.MENU_ROWS] as readonly {
  readonly id: MenuChoice;
  readonly title: string;
}[];
