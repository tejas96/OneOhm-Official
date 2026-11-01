/** Copy for rating each finished stage (PRD 5.7). */
export const STAGE_RATING = {
  stage: {
    survey: 'site survey',
    installation: 'installation',
    commissioning: 'switch-on and handover',
  },
  cardTitle: (stage: string) => `How was the ${stage}?`,
  cardBody: (project: string) => `${project} · it takes a few seconds.`,
  cardAction: 'Rate it',
  screenTitle: (stage: string) => `Rate the ${stage}`,
  intro: 'Your stars go to the team who did the work. Only you can rate your project.',
  overall: 'Overall',
  stars: ['Poor', 'Could be better', 'Good', 'Very good', 'Excellent'] as const,
  pick: 'Choose a rating first.',
  comment: 'Tell us more',
  commentHint: 'What went well, and what could we do better?',
  commentNeeded: 'Please tell us what went wrong.',
  people: 'The people who did it',
  peopleHint: 'Optional. Rate anyone you met.',
  crew: (name: string) => `${name} crew`,
  submit: 'Send rating',
  sent: 'Thank you. The team will see this.',
} as const;
