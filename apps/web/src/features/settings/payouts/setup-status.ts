import type { PayoutIp, PayoutSetup } from '@oneohm/api-contracts';

/** The one-word state of bank transfers, in the owner's terms. */
export type SetupStatus = 'off' | 'practice' | 'liveTest' | 'live';

/** ok = good, warn = needs a look, idle = not needed in this mode or nothing yet. */
export type CheckTone = 'ok' | 'warn' | 'idle';

export type CheckKey =
  | 'accountNumber'
  | 'keys'
  | 'webhookSecret'
  | 'lastWebhook'
  | 'lastCheck'
  | 'openPayouts'
  | 'lowBalance'
  | 'allowList';

export interface SetupCheck {
  readonly key: CheckKey;
  readonly tone: CheckTone;
}

/** Off / Practice (no real money) / Live (test keys) / Live. */
export function setupStatus(setup: Pick<PayoutSetup, 'mode' | 'keysAreTest'>): SetupStatus {
  if (setup.mode === 'off') return 'off';
  if (setup.mode === 'sandbox') return 'practice';
  return setup.keysAreTest ? 'liveTest' : 'live';
}

/** True when the last low-balance failure has not been followed by a good payout. */
export function lowBalanceOpen(
  setup: Pick<PayoutSetup, 'lastLowBalanceAt' | 'lastGoodPayoutAt'>,
): boolean {
  if (!setup.lastLowBalanceAt) return false;
  if (!setup.lastGoodPayoutAt) return true;
  return Date.parse(setup.lastLowBalanceAt) > Date.parse(setup.lastGoodPayoutAt);
}

/** The checklist, one row per thing worth checking, with how each one stands. */
export function setupChecks(setup: PayoutSetup & PayoutIp): readonly SetupCheck[] {
  const live = setup.mode === 'live';
  const on = setup.mode !== 'off';
  const needed = (set: boolean, required: boolean): CheckTone =>
    set ? 'ok' : required ? 'warn' : 'idle';
  const keysTone: CheckTone = !setup.keysSet
    ? on
      ? 'warn'
      : 'idle'
    : live && setup.keysAreTest
      ? 'warn'
      : 'ok';
  const checkTone: CheckTone = setup.lastCheckError
    ? 'warn'
    : setup.lastCheckAt
      ? 'ok'
      : live
        ? 'warn'
        : 'idle';
  return [
    { key: 'accountNumber', tone: needed(setup.accountNumberSet, on) },
    { key: 'keys', tone: keysTone },
    { key: 'webhookSecret', tone: needed(setup.webhookSecretSet, live) },
    { key: 'lastWebhook', tone: needed(setup.lastWebhookAt !== null, live) },
    { key: 'lastCheck', tone: checkTone },
    { key: 'openPayouts', tone: setup.stuckPayouts > 0 ? 'warn' : 'ok' },
    { key: 'lowBalance', tone: lowBalanceOpen(setup) ? 'warn' : 'ok' },
    // Only shown when RazorpayX last refused this server's IP.
    ...(setup.ipBlocked ? [{ key: 'allowList', tone: 'warn' } as const] : []),
  ];
}
