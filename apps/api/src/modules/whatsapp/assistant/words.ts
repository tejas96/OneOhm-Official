import { localized } from './language';
import { HI } from './words-hi';
import { MR } from './words-mr';

/** What the WhatsApp assistant says (PRD 6.1), in plain words and the "we" voice. */
const EN_WORDS = {
  menuButton: 'Choose',
  unknownNumber:
    'Hello! This number is not linked to any of our customers yet. If you are interested in solar, tap "Call me back". If you are a customer with another number, please write from that number.',
  callMeBack: 'Call me back',
  callbackNoted: 'Thank you! Someone from our team will call you soon.',
  noProject: 'We do not have a project for you yet.',
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
    received: 'Subsidy reached your bank ✅',
    checking: 'Subsidy: we are checking with the government',
  } as Record<string, string>,
  waitingOn: {
    customer: 'Waiting for something from you',
    bank: 'Waiting for the bank',
    discom: 'Waiting for the electricity board (DISCOM)',
  } as Record<string, string>,
  payNow: 'Pay now',
  noDocuments: 'No documents yet. They will appear here as your project moves.',
  askProblem:
    'Please tell us the problem in one message (for example "inverter shows an error since morning"). You can send a photo with a caption.',
  noRequests: 'You have not told us about any problem.',
  askReferral:
    'Send your friend\'s name and 10-digit mobile number in one message, for example "Suresh Patil 9876543210".',
  referralKnown: 'We are already in touch with this number. Thank you for thinking of us!',
  referralUnclear: 'We could not find a name and a 10-digit mobile number. Please try again.',
  referredWelcome: (referrer: string, company: string) =>
    `Welcome${company ? ` to ${company}` : ''}! ${referrer} referred you. Our team will call you on this number soon to plan your solar.`,
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
  talkToPerson: 'Talk to a person',
  photoAdded: 'Thank you, the photo is added to your problem.',
  photoNotAdded: 'We could not add the file to your problem. Please send a photo of it.',
  /** One reply for a burst of files that joined the problem (photos, videos, voice notes). */
  joined: (photos: number, videos: number, voices: number) => {
    const parts = [
      photos > 0 ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : '',
      videos > 0 ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : '',
      voices > 0 ? `${voices} ${voices === 1 ? 'voice note' : 'voice notes'}` : '',
    ].filter(Boolean);
    const last = parts.pop();
    return `Added ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last} to your problem ✅`;
  },
  tooLarge: 'That file is too big (max 25 MB). Please send a photo or PDF.',
  wrongType: "We can't open this kind of file. Please send a photo or PDF.",
  emptyFile: 'That file is empty. Please send it again.',
  failed: 'Sorry, we could not open that file. Please send it again in a little while.',
  paperGone: 'That paper is no longer needed, or we have it already. Nothing was changed.',
  paperAskEnded: 'Your files are already saved. Nothing else was changed.',
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
  noAmc: 'AMC: none yet. Ask us here for yearly cleaning and check-up visits.',
  help: 'For a problem with any of these, tap Report a problem below.',
} as const;

/** "My rewards": the people the customer referred and what they earned (PRD 5.6). */
const EN_REWARD_WORDS = {
  none: 'You have not referred anyone yet. You earn a reward when a friend you refer gets solar installed.',
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
} as const;

/** Lines in the progress, payments and requests answers. */
const EN_ANSWER_WORDS = {
  allDone: (steps: number) => `All ${steps} steps done. Your solar system is complete.`,
  next: (title: string, when: string) => `Next: ${title}, planned ${when}`,
  waitingSince: (who: string, when: string) => `${who} since ${when}`,
  home: (home: string, size: string) => `*Your ${home} solar* · ${size}`,
  total: (home: string, total: string) => `*${home} solar* — ${total} total`,
  paid: (amount: string) => `✅ ${amount} paid`,
  bank: (amount: string) => `⚪ ${amount} by bank loan`,
  later: (amount: string, when: string) => `⚪ ${amount} ${when}`,
  due: (amount: string) => `🔴 *${amount} due now*`,
  requestStatus: { open: 'Received', in_progress: 'We are working on it', resolved: 'Fixed' },
  technicianVisit: (when: string) => `Technician visit: ${when}`,
} as const;

/** The kind of problem, in the customer's words, for "We noted your problem (…)". */
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

export const WORDS = pick('WORDS');
export const RATINGS = pick('RATINGS');
export const MEDIA_WORDS = pick('MEDIA_WORDS');
export const COVER_WORDS = pick('COVER_WORDS');
export const REWARD_WORDS = pick('REWARD_WORDS');
export const FEEDBACK_WORDS = pick('FEEDBACK_WORDS');
export const ANSWER_WORDS = pick('ANSWER_WORDS');
export const CATEGORY_WORDS = pick('CATEGORY_WORDS');
