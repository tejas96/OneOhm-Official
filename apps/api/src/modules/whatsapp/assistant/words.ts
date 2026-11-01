/**
 * What the WhatsApp assistant says (PRD 6.1), in plain words. Row titles stay within
 * WhatsApp's limits: 24 characters for list rows and 20 for buttons.
 */
export const MENU_ROWS = [
  { id: 'progress', title: 'Project progress', description: 'Where your solar work stands' },
  { id: 'payments', title: 'Payments', description: 'Paid, due and a link to pay' },
  { id: 'documents', title: 'Documents', description: 'Quotation, receipts and papers' },
  { id: 'service', title: 'Report a problem', description: 'Raise a service request' },
  { id: 'requests', title: 'My requests', description: 'Status of service requests' },
  { id: 'warranty', title: 'Warranty and AMC', description: 'Your equipment and cover' },
  { id: 'refer', title: 'Refer a friend', description: 'Share OneOhm and earn rewards' },
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
