/**
 * The team's task for a chat-only ask of a customer not on WhatsApp, in staff words ("Ask Asha in person for
 * the location of Baner"), not the sentence the customer would have read. `given` is the message's payload.
 */
type Given = Readonly<Record<string, string | undefined>>;

const LINES: Readonly<Record<string, (customer: string, p: Given) => string>> = {
  location_request: (c, p) => `Ask ${c} in person for the location of ${p.home ?? 'their home'}`,
  callback_request: (c) => `Ask ${c} in person when we should call them back`,
  visit_pick: (c, p) =>
    `Ask ${c} in person which day suits for the ${p.work ?? 'visit'} at ${p.home ?? 'their home'}`,
  signature_request: (c) => `Take ${c}'s agreement on the paper in person`,
  site_ready_check: (c) => `Ask ${c} in person whether the roof is ready`,
  installation_check: (c) => `Ask ${c} in person whether the installation is finished`,
  reward_upi_ask: (c, p) =>
    `Ask ${c} in person for their UPI ID (${p.amount ?? 'referral'} reward)`,
  subsidy_register_help: (c) => `Help ${c} register for the subsidy in person`,
  subsidy_credit_check: (c) => `Ask ${c} in person whether the subsidy reached their bank`,
  bank_sign_visit: (c, p) =>
    `Remind ${c} in person of the bank visit${p.day ? ` on ${p.day}` : ''}`,
  layout_approval: (c) => `Show ${c} the panel layout in person and ask if it looks good`,
  visit_reminder: (c, p) =>
    `Tell ${c} in person that our team visits ${p.home ?? 'their home'}${p.when ? ` ${p.when}` : ''}${p.work ? ` for the ${p.work}` : ''}`,
  inspection_presence: (c, p) =>
    `Tell ${c} in person that ${p.work ?? 'the DISCOM visit'} is on ${p.day ?? 'the set day'} and ask them to be at home`,
};

/** The task for this template, or null when it has no staff wording (the customer's words are used). */
export function inPersonLine(
  template: string,
  customer: string,
  given: Given,
): { title: string; body: string } | null {
  const line = LINES[template]?.(customer, given);
  return line
    ? { title: line, body: `${customer} is not on WhatsApp: do this with them in person.` }
    : null;
}
