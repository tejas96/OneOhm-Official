/** English (India) copy for My month: the Today strip and the month screen (Duty Day step 7). */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const MONTH_CARD = {
  overline: 'MY MONTH',
  payable: 'payable so far',
  payableDone: 'payable',
  travel: 'travel approved',
  travelPaid: (paid: string) => `${paid} paid`,
  noTravel: 'No travel this month',
  final: 'Final',
  see: 'See my month',
  retry: 'Load my month again',
  loading: 'Loading your month',
  failed: 'Your month could not load. Tap to try again.',
} as const;

export const MONTH = {
  overline: 'SALARY',
  title: 'My month',
  loading: 'Loading your month',
  prev: 'Previous month',
  next: 'Next month',
  final: 'Final',
  lockedOn: (when: string) => `Locked on ${when}. These are your final numbers.`,
  changedAfterLock:
    'Something changed after the month was locked. HR will update your final numbers.',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  status: {
    present: 'Present',
    half_day: 'Half day',
    absent: 'Absent',
    paid_leave: 'Paid leave',
    unpaid_leave: 'Unpaid leave',
    holiday: 'Holiday',
    weekly_off: 'Weekly off',
    not_joined: 'Not working yet',
    left: 'No longer working',
    upcoming: 'Not counted yet',
  },
  marks: {
    late: 'Late',
    autoClosed: 'Day closed by us',
    doubtful: 'Doubtful visit',
    offUnpaid: 'Day off not paid',
  },
  unpaidOffs: (days: string) =>
    `${days} off not paid: no work or paid leave in that week (Monday to Sunday).`,
  legend: 'What the colours mean',
  tapDay: 'Tap a day to see what it counts as.',
  day: {
    checkIn: (time: string) => `In ${time}`,
    checkOut: (time: string) => `Out ${time}`,
    onDuty: 'Still on duty',
    noCheckIn: 'No check-in',
    worked: (hours: string) => `${hours} worked`,
    halfLeave: (label: string) => `${label}, half day`,
    leave: (label: string, paid: boolean) => `${label} (${paid ? 'paid' : 'unpaid'})`,
    pendingLeave: 'Leave asked, waiting for approval',
    correction: 'Correction waiting for your manager',
    tapDelayed: 'Tap reached us late',
    dayOff: 'You worked on a day off',
    alert: 'An alert is still open',
  },
  period: {
    sofar: (date: string) => `so far, to ${date}`,
    whole: (month: string) => `for ${month}`,
  },
  payableDays: 'Payable days',
  sections: { days: 'YOUR DAYS', travel: 'TRAVEL', pay: 'PAY', check: 'TO CHECK' },
  rows: {
    present: 'Present',
    halfDays: 'Half days',
    absent: 'Absent',
    paidLeave: 'Paid leave',
    unpaidLeave: 'Unpaid leave',
    offs: 'Holidays and weekly offs',
    lates: 'Late marks',
    hours: 'Hours worked',
    travelApproved: 'Approved',
    travelPaid: 'Paid to you',
    travelWaiting: 'Waiting for approval',
    bonus: 'Bonuses',
    gross: 'Gross pay',
  },
  lateRule: (every: number, deduction: number, days: string) =>
    deduction > 0
      ? `Every ${every} lates cost half a day: ${days} taken off.`
      : `Every ${every} lates cost half a day.`,
  grossMath: (pay: string, payable: string, daysInMonth: number, gross: string) =>
    `${pay} × ${payable} ÷ ${daysInMonth} days = ${gross}`,
  grossNote: 'Before PF, ESI and tax. Your payslip may differ.',
  nothingToCheck: 'Nothing to check. Your month looks clean.',
  flags: {
    auto_closed: (n: number) => `${count(n, 'day', 'days')} we closed for you (no check-out)`,
    delayed_tap: (n: number) => `${count(n, 'tap', 'taps')} reached us late`,
    open_correction: (n: number) =>
      `${count(n, 'correction', 'corrections')} waiting for your manager`,
    pending_leave: (n: number) => `${count(n, 'leave', 'leaves')} waiting for approval`,
    pending_travel: (n: number) =>
      `${count(n, 'travel claim', 'travel claims')} waiting for approval`,
    doubtful_visit: (n: number) => `${count(n, 'site visit', 'site visits')} with a doubtful route`,
    open_alert: (n: number) => `${count(n, 'alert', 'alerts')} still open`,
    absent_no_reason: (n: number) => `${count(n, 'day', 'days')} with no check-in and no leave`,
  },
  actions: {
    fixTimes: 'Fix my times',
    leave: 'See my leave',
    travel: 'See my travel',
    alerts: 'See alerts',
    askLeave: 'Ask for leave',
  },
  more: (n: number) => `+${n} more`,
  loadError: 'Your month could not load',
} as const;
