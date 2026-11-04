/** English (India) copy for announcements, rewards and the Today cards (PRD 4.1, 4.7). */
const days = (halves: number) => {
  const value = halves / 2;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'day' : 'days'}`;
};

export const ANNOUNCEMENTS = {
  overline: 'ANNOUNCEMENT',
  posted: (name: string | null, when: string) => (name ? `${name} · ${when}` : when),
  until: (date: string) => `Until ${date}`,
} as const;

export const LEAVE_CARD = {
  overline: 'LEAVE',
  days,
  leftOf: (label: string) => `${label} left`,
  other: (label: string, halves: number) => `${label}: ${days(halves)}`,
  waiting: (halves: number) => `${days(halves)} waiting`,
  request: 'Request leave',
} as const;

export const REWARDS_CARD = {
  overline: 'POINTS',
  points: (points: number) => (points === 1 ? '1 point' : `${points} points`),
  thisMonth: 'this month',
  total: (points: number) => `${points} in all`,
  earned: (count: number) => (count === 1 ? '1 achievement' : `${count} achievements`),
  see: 'See rewards',
  none: 'Finish tasks on time to earn points.',
} as const;

export const REWARDS = {
  overline: 'POINTS AND REWARDS',
  title: 'Rewards',
  loading: 'Loading your rewards',
  thisMonth: (points: number) => `${points} points this month`,
  total: 'points in all',
  points: (points: number) => (points > 0 ? `+${points}` : String(points)),
  missedPoints: 'Missed',
  month: {
    onTime: 'On time',
    firstTime: 'First-time right',
    tasks: 'Tasks judged',
    noneMissed: 'Nothing missed this month. Well done.',
    noneJudged: 'Nothing judged yet this month.',
  },
  sections: {
    month: 'THIS MONTH',
    achievements: 'ACHIEVEMENTS',
    money: 'BONUSES AND INCENTIVES',
    feedback: 'WHAT CUSTOMERS SAID',
    history: 'POINTS HISTORY',
  },
  source: {
    task_on_time: 'On-time work',
    task_first_time: 'First-time right',
    customer_rating: 'Customer rating',
    recognition: 'Recognition',
    stage_rating: 'Customer named you',
  },
  achievements: {
    on_time_streak: { title: 'On a roll', body: '5 tasks on time in a row' },
    on_time_25: { title: 'Reliable', body: '25 tasks finished on time' },
    five_star: { title: 'Five stars', body: 'A customer gave you 5 stars' },
    five_star_5: { title: 'Customer favourite', body: '5 customers gave you 5 stars' },
    recognised: { title: 'Recognised', body: 'Your manager recognised your work' },
    points_500: { title: '500 club', body: '500 points earned' },
  },
  earnedBadge: 'Earned',
  progress: (current: number, target: number) => `${current} of ${target}`,
  stages: {
    survey: 'Site survey',
    installation: 'Installation',
    commissioning: 'Switch-on and handover',
  } as Readonly<Record<string, string>>,
  stars: (stars: number) => `${stars} of 5 stars`,
  noComment: 'No comment',
  noFeedback: 'When customers name you in their ratings, it shows here.',
  noHistory: 'Finish tasks on time and earn points.',
  noMoney: 'Project bonuses and incentives show here once they are proposed.',
  approvedTotal: 'approved, to be paid',
  paidTotal: 'paid',
  bonusState: {
    pending: 'Waiting for approval',
    approved: 'Approved · Finance pays next',
    paid: (date: string) => `Paid on ${date}`,
  },
} as const;

export const CONTACT = {
  title: (company: string) => `Contact ${company}`,
  titleOffice: 'Contact the office',
  body: 'Questions about a lead, a quotation or your commission? Call or WhatsApp the office.',
  call: 'Call',
  whatsapp: 'WhatsApp',
  noNumber: 'The office number is not set up yet. Ask your contact.',
} as const;

export const QUICK_LEAVE = 'Request leave';
