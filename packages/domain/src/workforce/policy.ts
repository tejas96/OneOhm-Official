/**
 * Leave, attendance and points rules (PRD 3.12, 4.3, 4.6, 4.7, 7.2). Owners edit them in
 * Settings; these are the starting values for a new install.
 */
export interface LeaveType {
  readonly key: string;
  readonly label: string;
  /** Days allowed per calendar year. */
  readonly daysPerYear: number;
}

export interface AttendancePolicy {
  /** Day start and end, "HH:MM" in India time. */
  readonly dayStart: string;
  readonly dayEnd: string;
  /** Minutes after the day start before a check-in counts as late. */
  readonly graceMinutes: number;
  /** Ask for the phone's location at check-in and check-out (with consent). */
  readonly captureLocation: boolean;
  /** Location readings are deleted after this many days. */
  readonly retentionDays: number;
}

export interface PointsPolicy {
  /** A task finished on or before its due date. Late tasks earn nothing; none lose points. */
  readonly onTimeTask: number;
  /** Suggested for the project manager when a customer rates 4 or 5 stars. */
  readonly goodRating: number;
  /** Most a manager can give in one recognition. */
  readonly recognitionMax: number;
}

export interface WorkforcePolicy {
  readonly leaveTypes: readonly LeaveType[];
  /** Days of the week off (0 = Sunday … 6 = Saturday); not counted as leave. */
  readonly weeklyOff: readonly number[];
  readonly attendance: AttendancePolicy;
  readonly points: PointsPolicy;
}

export const DEFAULT_WORKFORCE_POLICY: WorkforcePolicy = {
  leaveTypes: [
    { key: 'casual', label: 'Casual leave', daysPerYear: 12 },
    { key: 'sick', label: 'Sick leave', daysPerYear: 6 },
  ],
  weeklyOff: [0],
  attendance: {
    dayStart: '09:30',
    dayEnd: '18:30',
    graceMinutes: 15,
    captureLocation: true,
    retentionDays: 90,
  },
  points: { onTimeTask: 10, goodRating: 50, recognitionMax: 200 },
};
