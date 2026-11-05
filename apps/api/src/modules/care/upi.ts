/** A UPI ID (virtual payment address): letters, digits, dots, dashes or underscores, an @, then the bank handle. */
const UPI = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9.-]{1,31}$/;

/** The UPI ID typed or posted, lower case and trimmed; null when it is not in the name@bank shape. */
export function readUpi(typed: string | null | undefined): string | null {
  const id = (typed ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return UPI.test(id) ? id : null;
}
