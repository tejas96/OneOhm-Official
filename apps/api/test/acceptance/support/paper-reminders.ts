import { queuePaperReminders } from '../../../../worker/src/activities/paper-reminders';
import { acceptanceDb } from './db';

/** The worker's paper reminders run once by hand at a chosen clock (the timer is off here). */
export const runPaperReminders = (now = new Date()) => queuePaperReminders(acceptanceDb().db, now);
