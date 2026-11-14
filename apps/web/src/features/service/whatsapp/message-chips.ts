import type { ChatForm } from '@oneohm/api-contracts';

/** The outgoing message kinds whose last line is "[A · B · C]" (their buttons or list rows). */
const CHIP_KINDS: ReadonlySet<string> = new Set([
  'buttons',
  'list',
  'flow',
  'cta_url',
  'location_request',
]);

const TRAILING_GROUP = /\n?[ \t]*\[([^[\]\n]+)\][ \t]*$/;

/**
 * An interactive message's text and the button titles on its last line. Only a final bracket
 * group counts; brackets earlier in the text stay text. No chips for other kinds.
 */
export function splitChips(kind: string, body: string): { text: string; chips: string[] } {
  if (!CHIP_KINDS.has(kind)) return { text: body, chips: [] };
  const match = TRAILING_GROUP.exec(body);
  if (!match?.[1]) return { text: body, chips: [] };
  const chips = match[1]
    .split(' · ')
    .map((title) => title.trim())
    .filter(Boolean);
  if (chips.length === 0) return { text: body, chips: [] };
  return { text: body.slice(0, match.index).trimEnd(), chips };
}

/** Where a form card's "Open" link goes, and which word it uses. */
export function formLinkTarget(link: NonNullable<ChatForm['link']>): {
  href: string;
  label: 'openTicket' | 'openLead' | 'openCustomer' | 'openProject';
} {
  switch (link.kind) {
    case 'service_request':
      return { href: `/service?request=${link.id}`, label: 'openTicket' };
    case 'lead':
      return { href: `/leads/${link.id}`, label: 'openLead' };
    case 'customer':
      return { href: `/customers/${link.id}`, label: 'openCustomer' };
    case 'payment':
      return { href: `/projects/${link.id}?tab=payments`, label: 'openProject' };
    case 'project':
      return { href: `/projects/${link.id}`, label: 'openProject' };
  }
}
