import type { ServiceRequest } from '@oneohm/api-contracts';

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
  submit: 'Send to OneOhm',
  sent: 'Sent. Our service team will call you.',
  historyTitle: 'Your requests',
  emptyTitle: 'No requests yet',
  emptyBody: 'If anything goes wrong with your system, ask for help here.',
  category: {
    no_generation: 'No electricity from solar',
    low_generation: 'Less electricity than usual',
    inverter_error: 'Inverter error or alarm',
    physical_damage: 'Damage to panels or wiring',
    cleaning: 'Panel cleaning',
    billing_net_meter: 'Electricity bill or net meter',
    subsidy: 'Subsidy question',
    other: 'Something else',
  } satisfies Readonly<Record<ServiceRequest['category'], string>>,
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
} as const;

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
    in_progress: 'Talking to OneOhm',
    installed: 'Went solar',
    closed: 'Closed',
  },
  referredOn: (date: string) => `Referred ${date}`,
} as const;

export const FEEDBACK = {
  title: 'Rate your experience',
  intro: 'How was your OneOhm solar journey, from the first visit to switch-on?',
  ratingLabel: 'Your rating',
  stars: ['Poor', 'Could be better', 'Good', 'Very good', 'Excellent'] as const,
  commentLabel: 'Tell us more',
  commentHint: 'What went well, and what could we do better?',
  submit: 'Send rating',
  sent: 'Thank you for your rating.',
  pickRating: 'Choose a rating first.',
} as const;
