export const SUPPORT = {
  title: 'Help',
  intro: 'Something not right with your system? Tell us and the service team will call you.',
  loading: 'Loading your requests',
  newRequest: 'Ask for help',
  formTitle: 'What do you need help with?',
  formDescription: 'Pick the closest match and tell us a little about it.',
  categoryLabel: 'Kind of problem',
  projectLabel: 'Which system',
  descriptionLabel: 'What is happening?',
  descriptionHint: 'For example: the inverter shows a red light since this morning.',
  submit: 'Send request',
  sent: 'Sent. Our service team will call you.',
  historyTitle: 'Your requests',
  emptyTitle: 'No requests yet',
  emptyBody: 'If anything goes wrong with your system, ask for help here.',
  status: { open: 'Received', in_progress: 'Being handled', resolved: 'Resolved' },
  raisedOn: (date: string) => `Raised ${date}`,
  resolution: 'What we did',
  photosLabel: 'Photos',
  photosHint: 'Optional. A photo of the inverter screen or the panels helps us come prepared.',
  takePhoto: 'Take photo',
  choosePhotos: 'Choose photos',
  removePhoto: 'Remove photo',
  photoCount: (count: number) => (count === 1 ? '1 photo' : `${count} photos`),
  photosFailed: (count: number) =>
    count === 1
      ? 'Sent, but 1 photo could not be uploaded.'
      : `Sent, but ${count} photos could not be uploaded.`,
  cameraDenied: 'Allow camera access in your phone settings to take a photo.',
  libraryDenied: 'Allow photo access in your phone settings to attach photos.',
  /** A kind of problem by its key; English keeps the name set in Settings. */
  category: (_key: string, label: string) => label,
} as const;

type ReferEvent = 'project_created' | 'advance_paid' | 'commissioned';
const FRIEND_DOES: Readonly<Record<ReferEvent, string>> = {
  project_created: 'books their solar project',
  advance_paid: 'pays the advance',
  commissioned: 'has their system switched on',
};
const THEY_DO: Readonly<Record<ReferEvent, string>> = {
  project_created: 'book their project',
  advance_paid: 'pay the advance',
  commissioned: 'switch their system on',
};

export const REFER = {
  title: 'Refer a neighbour',
  intro:
    'Know someone who wants lower electricity bills? Share their number and our team will call them.',
  nameLabel: 'Their name',
  phoneLabel: 'Their mobile number',
  cityLabel: 'Town or city',
  noteLabel: 'Anything we should know?',
  submit: 'Send referral',
  sent: 'Thank you! We will call them soon.',
  historyTitle: 'People you referred',
  emptyBody: 'Your referrals and how they are going will show here.',
  status: {
    received: 'Received',
    in_progress: 'Talking to our team',
    ordered: 'Going solar',
    installed: 'Went solar',
    closed: 'Closed',
  },
  referredOn: (date: string) => `Referred ${date}`,
  codeTitle: 'Your referral code',
  codeLabel: (code: string) => `Your referral code is ${code}`,
  codeHint: 'Friends quote this code on WhatsApp or when our team calls.',
  terms: (amount: string, event: ReferEvent) =>
    `Earn ${amount} when your friend ${FRIEND_DOES[event]}.`,
  termsPerKw: (amount: string, event: ReferEvent) =>
    `Earn ${amount} for every kW your friend installs, once they ${THEY_DO[event]}.`,
  termsOff: 'Share your code with anyone who wants solar. We call them and keep you posted.',
  approvalNote: 'We approve each reward, then pay it to you.',
  shareWhatsApp: 'Share on WhatsApp',
  shareOther: 'Share another way',
  shareFailed: 'Sharing did not open. Tell your friend your code instead.',
  shareText: (code: string, link: string | null, company: string) =>
    link
      ? `I got solar from ${company} and my electricity bill came down. Want solar too? Message ${company} on WhatsApp with my referral code ${code}: ${link}`
      : `I got solar from ${company} and my electricity bill came down. Want solar too? Call ${company} and quote my referral code ${code}.`,
  friendMessage: (code: string, company: string) =>
    `Hi ${company}, I would like solar for my home. My referral code is ${code}.`,
  totals: {
    earned: 'Earned',
    pending: 'Waiting for approval',
    approved: 'Approved',
    paid: 'Paid to you',
  },
  reward: {
    pending: 'Reward pending',
    approved: 'Reward approved',
    paid: 'Reward paid',
    rejected: 'Not eligible',
  },
  rewardAmount: (amount: string) => `Reward ${amount}`,
  rewardPaidOn: (amount: string, date: string) => `${amount} paid ${date}`,
} as const;

export const FEEDBACK = {
  title: 'Rate your experience',
  intro: 'How was your solar journey with us, from the first visit to switch-on?',
  ratingLabel: 'Your rating',
  stars: ['Poor', 'Could be better', 'Good', 'Very good', 'Excellent'] as const,
  commentLabel: 'Tell us more',
  commentHint: 'What went well, and what could we do better?',
  submit: 'Send rating',
  sent: 'Thank you for your rating.',
  pickRating: 'Choose a rating first.',
} as const;
