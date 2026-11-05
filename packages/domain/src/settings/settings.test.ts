import { describe, expect, it } from 'vitest';
import { checkApprovalPolicy, DEFAULT_APPROVAL_POLICY, mayApproveAmount } from './approval-policy';
import { checkDashboardSettings, DEFAULT_DASHBOARD_SETTINGS } from './dashboard-settings';
import { compareRuns, isRetryableJob, jobErrorText } from './job-runs';
import { checkPaymentSettings, DEFAULT_PAYMENT_SETTINGS, feeEstimate } from './payment-settings';
import { checkProjectVariant, projectVariantOf } from './project-types';
import {
  checkReminderTiming,
  DEFAULT_REMINDER_TIMING,
  followUpHorizon,
  paymentReminderRound,
  timeReached,
} from './reminder-timing';
import { isClockTime, withDefaults } from './settings-check';

describe('reminder timing (PRD 7.2)', () => {
  it('accepts the shipped timing and refuses odd values', () => {
    expect(checkReminderTiming(DEFAULT_REMINDER_TIMING)).toEqual({});
    const errors = checkReminderTiming({
      ...DEFAULT_REMINDER_TIMING,
      paymentRepeatDays: 0,
      staffDigestTime: '25:00',
      followUpLeadDays: 1.5,
      subsidyChaseDays: 0,
    });
    expect(Object.keys(errors).sort()).toEqual([
      'followUpLeadDays',
      'paymentRepeatDays',
      'staffDigestTime',
      'subsidyChaseDays',
    ]);
  });

  it('sends the first payment reminder after the grace days, then every repeat', () => {
    const timing = { paymentGraceDays: 3, paymentRepeatDays: 7 };
    expect(paymentReminderRound('2026-11-01', '2026-11-03', timing)).toBeNull();
    expect(paymentReminderRound('2026-11-01', '2026-11-04', timing)).toBe(0);
    expect(paymentReminderRound('2026-11-01', '2026-11-10', timing)).toBe(0);
    expect(paymentReminderRound('2026-11-01', '2026-11-11', timing)).toBe(1);
  });

  it('knows when a set time has come and how far ahead follow-ups are reminded', () => {
    expect(timeReached('08:30', '08:29')).toBe(false);
    expect(timeReached('08:30', '08:30')).toBe(true);
    expect(followUpHorizon('2026-11-01', { followUpLeadDays: 2 })).toBe('2026-11-03');
    expect(isClockTime('8:30')).toBe(false);
  });

  it('keeps defaults for anything an older save lacks', () => {
    expect(withDefaults(DEFAULT_REMINDER_TIMING, { paymentGraceDays: 5 })).toEqual({
      ...DEFAULT_REMINDER_TIMING,
      paymentGraceDays: 5,
    });
    expect(withDefaults(DEFAULT_REMINDER_TIMING, null)).toEqual(DEFAULT_REMINDER_TIMING);
  });
});

describe('approval limits (PRD 7.2, 7.3)', () => {
  it('lets everyday staff approve only within a limit above zero', () => {
    const accounts = ['finance.record_payments'];
    expect(
      mayApproveAmount(accounts, 1000, 0, 'finance.approve_payments', 'finance.record_payments'),
    ).toBe(false);
    expect(
      mayApproveAmount(accounts, 5000, 5000, 'finance.approve_payments', 'finance.record_payments'),
    ).toBe(true);
    expect(
      mayApproveAmount(accounts, 5001, 5000, 'finance.approve_payments', 'finance.record_payments'),
    ).toBe(false);
    expect(
      mayApproveAmount(
        ['finance.approve_payments'],
        9_999_999,
        5000,
        'finance.approve_payments',
        'finance.record_payments',
      ),
    ).toBe(true);
  });

  it('checks the policy fields', () => {
    expect(checkApprovalPolicy(DEFAULT_APPROVAL_POLICY)).toEqual({});
    expect(
      Object.keys(
        checkApprovalPolicy({
          billLimitPaise: -1,
          bonusLimitPaise: 0.5,
          secondPersonAbovePaise: 0,
          escalateAfterDays: 0,
        }),
      ).sort(),
    ).toEqual(['billLimitPaise', 'bonusLimitPaise', 'escalateAfterDays']);
  });
});

describe('dashboard settings, project kinds and job runs', () => {
  it('checks dashboard numbers', () => {
    expect(checkDashboardSettings(DEFAULT_DASHBOARD_SETTINGS)).toEqual({});
    expect(
      checkDashboardSettings({ ...DEFAULT_DASHBOARD_SETTINGS, risksShown: 1 }).risksShown,
    ).toBe('Use a whole number of items from 3 to 20.');
  });

  it('names the kind of project from its type and mounting', () => {
    expect(projectVariantOf('residential', false)).toBe('residential');
    expect(projectVariantOf('commercial', true)).toBe('commercial_ground');
    expect(checkProjectVariant({ name: 'A', description: '' }).name).toBeDefined();
  });

  it('lists failures first and keeps errors short', () => {
    const runs = [
      { status: 'succeeded' as const, createdAt: '2026-11-02T03:00:00Z' },
      { status: 'failed' as const, createdAt: '2026-11-01T03:00:00Z' },
    ];
    expect([...runs].sort(compareRuns)[0]?.status).toBe('failed');
    expect(jobErrorText(new Error('Lost https://x.y/z?key=1'))).toBe('Lost [link]');
    expect(isRetryableJob('payment_reminders')).toBe(true);
    expect(isRetryableJob('payout_sync')).toBe(false);
  });
});

describe('payment settings', () => {
  it('has no fee until the owner enters one, and checks what they enter', () => {
    expect(DEFAULT_PAYMENT_SETTINGS.razorpayxFeePaise).toBeNull();
    expect(checkPaymentSettings({ razorpayxFeePaise: null })).toEqual({});
    expect(checkPaymentSettings({ razorpayxFeePaise: 590 })).toEqual({});
    expect(Object.keys(checkPaymentSettings({ razorpayxFeePaise: -1 }))).toEqual([
      'razorpayxFeePaise',
    ]);
    expect(Object.keys(checkPaymentSettings({ razorpayxFeePaise: 5.5 }))).toEqual([
      'razorpayxFeePaise',
    ]);
  });

  it('adds 18% GST separately and says nothing while the fee is unknown', () => {
    expect(feeEstimate(null)).toBeNull();
    expect(feeEstimate(1000)).toEqual({ feePaise: 1000, gstPaise: 180 });
    expect(feeEstimate(590)).toEqual({ feePaise: 590, gstPaise: 106 });
  });

  it('keeps a saved fee over the empty default', () => {
    expect(withDefaults(DEFAULT_PAYMENT_SETTINGS, { razorpayxFeePaise: 700 })).toEqual({
      razorpayxFeePaise: 700,
    });
    expect(withDefaults(DEFAULT_PAYMENT_SETTINGS, { razorpayxFeePaise: 'x' })).toEqual({
      razorpayxFeePaise: null,
    });
  });
});
