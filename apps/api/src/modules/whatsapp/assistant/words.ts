/**
 * What the WhatsApp assistant says (PRD 6.1), in plain words. Row titles stay within
 * WhatsApp's limits: 24 characters for list rows and 20 for buttons.
 */
export const MENU_ROWS = [
  { id: 'progress', title: 'Project progress', description: 'Where your solar work stands' },
  { id: 'payments', title: 'Payments', description: 'Paid, due and a link to pay' },
  { id: 'documents', title: 'Documents', description: 'Quotation, invoices, receipts, papers' },
  { id: 'service', title: 'Report a problem', description: 'Raise a service request' },
  { id: 'requests', title: 'My requests', description: 'Status of service requests' },
  { id: 'warranty', title: 'Warranty and AMC', description: 'Your equipment and cover' },
  { id: 'refer', title: 'Refer a friend', description: 'Share OneOhm and earn rewards' },
  { id: 'rewards', title: 'My rewards', description: 'Your referrals and rewards' },
  { id: 'feedback', title: 'Rate us', description: 'Tell us how we did' },
  { id: 'human', title: 'Talk to a person', description: 'A team member replies here' },
] as const;

export type MenuChoice = (typeof MENU_ROWS)[number]['id'];

export const WORDS = {
  menu: (name: string) =>
    `Hello ${name}! I am the OneOhm assistant. What would you like to see? You can type "menu" at any time.`,
  menuButton: 'Choose',
  unknownNumber:
    'Hello! This number is not linked to a OneOhm customer yet. If you are interested in solar, tap "Call me back". If you are a customer with another number, please write from that number.',
  callMeBack: 'Call me back',
  callbackNoted: 'Thank you! Someone from OneOhm will call you soon.',
  noProject:
    'We do not have a project for you yet. Tap "Talk to a person" in the menu to speak to us.',
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
    released: 'Subsidy: released',
  } as Record<string, string>,
  waitingOn: {
    customer: 'Waiting for something from you',
    bank: 'Waiting for the bank',
    discom: 'Waiting for the electricity board (DISCOM)',
  } as Record<string, string>,
  allPaid: 'Everything is paid. Thank you!',
  payHere: 'Pay here',
  noDocuments: 'No documents yet. They will appear here as your project moves.',
  linksExpire: (hours: number) => `Links work for ${hours} hours.`,
  askProblem:
    'Please tell us the problem in one message (for example "inverter shows an error since morning"). You can send a photo with a caption.',
  problemSaved: (category: string) =>
    `Thank you. Your ${category} request is raised. Our team will call you. Type "requests" to see its status.`,
  tooShort: 'Please write a few more words so we can help.',
  noRequests: 'You have no service requests.',
  askReferral:
    'Send your friend\'s name and 10-digit mobile number in one message, for example "Suresh Patil 9876543210".',
  referralSaved: (name: string) =>
    `Thank you! We will call ${name}. You earn a reward when their solar is installed.`,
  referralUnclear: 'I could not find a name and a 10-digit mobile number. Please try again.',
  referredWelcome: (referrer: string) =>
    `Welcome to OneOhm! ${referrer} referred you. Our team will call you on this number soon to plan your solar.`,
  askRating: 'How happy are you with OneOhm so far?',
  ratingSaved: 'Thank you for rating us! It helps the team.',
  humanSoon:
    'A OneOhm team member will reply here soon (Monday to Saturday, 9:30 am to 6:30 pm). Type "menu" to go back to the assistant.',
  notUnderstood: 'Sorry, I did not get that. Here is what I can help with.',
} as const;

export const RATINGS = [
  { id: 'rate:5', title: 'Very happy', description: '5 of 5' },
  { id: 'rate:4', title: 'Happy', description: '4 of 5' },
  { id: 'rate:3', title: 'Okay', description: '3 of 5' },
  { id: 'rate:2', title: 'Not happy', description: '2 of 5' },
  { id: 'rate:1', title: 'Very unhappy', description: '1 of 5' },
] as const;

/** Each file line in the "Documents" answer. */
export const FILE_WORDS = {
  quotation: (number: string, url: string) => `Quotation ${number}: ${url}`,
  invoice: (number: string, amount: string, url: string) =>
    `Tax invoice ${number} (${amount}): ${url}`,
  receipt: (number: string, amount: string, url: string) => `Receipt ${number} (${amount}): ${url}`,
  report: (name: string, code: string, url: string) => `${name} (${code}): ${url}`,
  paper: (name: string, url: string) => `${name}: ${url}`,
  more: 'More papers are in the OneOhm app.',
} as const;

/** Photos and papers the customer sends (PRD 6.1). */
export const MEDIA_WORDS = {
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
  notRead:
    'Sorry, I can only take photos and PDF papers here. Please type it in a few words, or type "menu" and tap "Talk to a person".',
  tooLarge: 'This file is too large. Please send a smaller photo or PDF.',
  failed: 'Sorry, we could not open that file. Please send it again in a little while.',
  problemSavedWithPhotos: (category: string, photos: number) =>
    `Thank you. Your ${category} request is raised with your ${photos === 1 ? 'photo' : `${photos} photos`}. Our team will call you. Type "requests" to see its status.`,
} as const;

/** The "Warranty and AMC" answer, the same cover the app shows (PRD 5.5). */
export const COVER_WORDS = {
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
  noAmc:
    'AMC: none yet. For yearly cleaning and check-up visits, type "menu" and tap "Talk to a person".',
  help: 'For a problem with any of these, tap "Report a problem" in the menu.',
} as const;

/** "My rewards": the people the customer referred and what they earned (PRD 5.6). */
export const REWARD_WORDS = {
  none: 'You have not referred anyone yet. Tap "Refer a friend" to share OneOhm. You earn a reward when their solar is installed.',
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
  more: (count: number) => `And ${count} more in the OneOhm app.`,
} as const;

/** Rating OneOhm on WhatsApp (PRD 6.1), asked only once the system is switched on. */
export const FEEDBACK_WORDS = {
  later:
    'Thank you! We will ask for your rating once your solar system is switched on. Type "menu" to see other options.',
  askComment: 'Thank you for rating us! Anything to add? Type it here, or type "skip".',
  commentSaved: 'Thank you, we have noted it. It helps the team do better.',
  skipWords: ['skip', 'no', 'nothing', 'no thanks', 'none', 'nahi', 'nako'] as readonly string[],
} as const;
