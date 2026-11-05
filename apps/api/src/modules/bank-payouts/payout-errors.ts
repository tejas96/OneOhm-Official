/** RazorpayX said no, in so many words. Nothing was sent. */
export class PayoutRejected extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly description: string,
    message?: string,
  ) {
    super(message ?? `RazorpayX ${httpStatus}: ${description}`);
    this.name = 'PayoutRejected';
  }
}

/** We cannot tell whether RazorpayX made the payout (timeout, network, server error). */
export class PayoutUnsure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayoutUnsure';
  }
}

/** RazorpayX words for an account that cannot cover the payout. */
export const isLowBalance = (error: PayoutRejected): boolean =>
  /not have enough balance|insufficient|low balance|balance is low/i.test(error.description);

export const LOW_BALANCE_TEXT =
  'Not enough money in your RazorpayX balance. Add money, then pay again.';

/** The line shown on a bill when RazorpayX turned the payout down. */
export const rejectionText = (error: PayoutRejected): string =>
  error.code === IP_NOT_ALLOWED
    ? IP_NOT_ALLOWED_TEXT
    : isLowBalance(error)
      ? LOW_BALANCE_TEXT
      : `RazorpayX did not accept it: ${error.description}. Nothing was sent.`;

export const NOT_REACHED_TEXT =
  'This did not reach RazorpayX. Nothing was sent. You can pay again.';

export const IP_NOT_ALLOWED = 'ip_not_allowed';

export const IP_NOT_ALLOWED_TEXT =
  "RazorpayX blocked this server. Ask your technical person to add the server's IP address in RazorpayX → Settings → Developer Controls → Allowlist IPs. Nothing was sent.";

/**
 * RazorpayX refuses payout calls from a server IP that is not on the account's allow-list.
 * Its exact words are not documented, so: any 401/403 whose text speaks of an IP, an
 * allow-list / whitelist or "not allowed", or a bare 403 with no explanation. A 401 that
 * only says the keys are wrong is not this.
 */
export function isIpNotAllowed(httpStatus: number, code: string, description: string): boolean {
  if (code === IP_NOT_ALLOWED) return true;
  if (httpStatus !== 401 && httpStatus !== 403) return false;
  if (/\bip\b|ip address|white-?list|allow-?list|not allowed/i.test(description)) return true;
  return httpStatus === 403 && description.trim() === '';
}

/** The rejection for a blocked server; its message is the owner text. */
export const ipNotAllowedRejection = (httpStatus: number, description: string): PayoutRejected =>
  new PayoutRejected(IP_NOT_ALLOWED, httpStatus, description, IP_NOT_ALLOWED_TEXT);
