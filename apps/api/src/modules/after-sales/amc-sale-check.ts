/**
 * Why an AMC cannot be sold for this project, or null when it can: an AMC maintains a
 * commissioned system, so it waits until testing and commissioning is done.
 */
export function amcSaleRefusal(status: string, commissionedOn: string | null): string | null {
  if (status === 'cancelled') return 'This project was cancelled.';
  if (!commissionedOn)
    return 'An AMC can be sold once the system is commissioned. Finish testing and commissioning first.';
  return null;
}
