/**
 * English (India) copy for OneOhm Field, one module per feature so the app can gain
 * Marathi and Hindi by swapping these objects.
 */
export const COMMON = {
  appName: 'OneOhm Field',
  loading: 'Loading',
  retry: 'Try again',
  loadError: 'This could not load',
  back: 'Back',
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save',
  done: 'Done',
  optional: 'Optional',
  tabs: {
    today: 'Today',
    work: 'Work',
    leads: 'Leads',
    quote: 'Quote',
    customers: 'Clients',
    earnings: 'Earnings',
    leave: 'Leave',
    profile: 'Me',
  },
  stages: {
    survey: 'Survey',
    design: 'Design',
    material: 'Material',
    installation: 'Installation',
    commissioning: 'Commissioning',
    net_metering: 'Net metering',
    subsidy: 'Subsidy',
  },
  parties: {
    internal: 'Our team',
    customer: 'Customer',
    bank: 'Bank',
    discom: 'DISCOM',
  },
  reconnect: {
    title: 'OneOhm is out of reach',
    body: 'Your session is saved. Check your connection, then try again.',
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
    morning: 'The panels are waking up.',
    midday: 'Peak sun over Sangli.',
    evening: 'Last light on the panels.',
    night: 'The grid has the night shift.',
  },
  form: {
    title: 'Sign in to OneOhm Field',
    description: 'For the OneOhm team, I&C crews and resellers. We text you a one-time code.',
    phoneLabel: 'Mobile number',
    phoneHint: 'The number your OneOhm administrator registered for you.',
    phoneInvalid: 'Enter your 10-digit mobile number.',
    sendCode: 'Text me a code',
    codeTitle: 'Enter your code',
    codeSentTo: (phone: string) => `We sent a 6-digit code to ${phone}.`,
    codeLabel: '6-digit code',
    verify: 'Sign in',
    changeNumber: 'Change number',
    resend: 'Send a new code',
    resendIn: (seconds: number) => `New code in ${seconds}s`,
  },
  customers: 'Customers sign in on the OneOhm app instead.',
} as const;

export const PROFILE = {
  title: 'Me',
  roles: 'Roles',
  noRoles: 'No role yet. Ask your administrator.',
  kind: { staff: 'Staff', partner: 'I&C partner crew', reseller: 'Reseller' },
  phone: 'Mobile',
  email: 'Email',
  server: 'Connected to',
  signOut: 'Sign out',
  signOutHint: 'You will need a new code to sign in again.',
  appearance: {
    title: 'Appearance',
    hint: 'Light, dark, or the same as your phone. Kept on this phone.',
    options: { system: 'Phone', light: 'Light', dark: 'Dark' },
  },
} as const;
