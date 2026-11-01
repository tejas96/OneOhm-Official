/**
 * English (India) copy for the OneOhm customer app, one module per feature. The Marathi
 * (`../mr`) and Hindi (`../hi`) modules have exactly this shape; screens read whichever
 * language is current through `../common.ts` and friends.
 */
export const COMMON = {
  appName: 'OneOhm',
  loading: 'Loading',
  retry: 'Try again',
  loadError: 'This could not load',
  back: 'Back',
  close: 'Close',
  cancel: 'Cancel',
  send: 'Send',
  optional: 'Optional',
  tabs: {
    home: 'Home',
    payments: 'Payments',
    documents: 'Documents',
    support: 'Help',
    profile: 'Me',
  },
  /** Plain names for the journey; never internal task terms (PRD 5.2). */
  stages: {
    survey: 'Site visit',
    design: 'System design',
    material: 'Equipment',
    installation: 'Installation',
    commissioning: 'Switch-on',
    net_metering: 'Net meter',
    subsidy: 'Subsidy',
  },
  projectType: { residential: 'Home', society: 'Housing society', commercial: 'Business' },
  reconnect: {
    title: 'OneOhm is out of reach',
    body: 'You are still signed in. Check your internet connection, then try again.',
    signOut: 'Sign out instead',
  },
} as const;

export const SIGN_IN = {
  logoLabel: 'OneOhm — Energy for everyone',
  hello: {
    morning: 'Good morning',
    midday: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good evening',
  },
  line: {
    morning: 'Your roof is about to start earning.',
    midday: 'Peak sun over your home.',
    evening: 'Last light on the panels.',
    night: 'Tomorrow’s sunshine is on its way.',
  },
  form: {
    title: 'Welcome to OneOhm',
    description: 'Follow your solar project, payments and papers in one place.',
    phoneLabel: 'Mobile number',
    phoneHint: 'The number you gave OneOhm when you booked.',
    sendCode: 'Text me a code',
    codeTitle: 'Enter your code',
    codeSentTo: (phone: string) => `We sent a 6-digit code to ${phone}.`,
    codeLabel: '6-digit code',
    verify: 'Continue',
    changeNumber: 'Change number',
    resend: 'Send a new code',
    resendIn: (seconds: number) => `New code in ${seconds}s`,
  },
  help: 'No code? Make sure this is the number on your OneOhm quotation.',
  language: 'Language',
} as const;

export const PROFILE = {
  title: 'Me',
  phone: 'Mobile',
  refer: 'Refer a neighbour',
  referHint: 'Know someone who wants solar? We will take it from here.',
  call: (company: string) => `Call ${company}`,
  whatsapp: (company: string) => `WhatsApp ${company}`,
  signOut: 'Sign out',
  signOutHint: 'You will need a new code to sign in again.',
  server: 'Connected to',
  language: 'Language',
  languageHint:
    'The app and your updates use this language. WhatsApp messages use it too where we have them in it.',
  languageNotSaved: 'Changed on this phone. We will save it to your account when you are online.',
} as const;
