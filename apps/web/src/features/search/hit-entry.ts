import type { SearchHit, SearchType } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import {
  ClipboardCheck,
  FileText,
  Folder,
  HardHat,
  Headset,
  IndianRupee,
  type LucideIcon,
  SolarPanel,
  Store,
  Target,
  Users,
} from 'lucide-react';
import { formatPhone } from '@/lib/format/contact';
import type { SearchEntry } from './search-index';

const ICONS: Readonly<Record<SearchType, LucideIcon>> = {
  projects: SolarPanel,
  customers: Users,
  leads: Target,
  quotations: FileText,
  tasks: ClipboardCheck,
  payments: IndianRupee,
  service: Headset,
  documents: Folder,
  contractors: HardHat,
  vendors: Store,
};

/** Words for a state value (a lead stage, a status, a file category); the value if none. */
export type StateWords = (type: SearchType, state: string) => string;

/** Joins the parts of a second line that are present. */
function line(...parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}

/** Where a found record opens on the web. */
export function hrefOf(hit: SearchHit): string {
  const parent = hit.parent;
  switch (hit.type) {
    case 'tasks':
      return parent ? `/projects/${parent.id}?tab=tasks` : '/command-center/tasks';
    case 'payments':
      return parent ? `/projects/${parent.id}?tab=payments` : '/finance?tab=receivables';
    case 'service':
      return `/service?tab=requests&view=all&request=${hit.id}`;
    case 'documents':
      return documentHref(hit);
    case 'vendors':
      return `/inventory/vendors/${hit.id}`;
    default:
      return `/${hit.type}/${hit.id}`;
  }
}

function documentHref(hit: SearchHit): string {
  const parent = hit.parent;
  if (!parent) return '/projects';
  if (parent.type === 'projects' || parent.type === 'customers')
    return `/${parent.type}/${parent.id}?tab=documents`;
  if (parent.type === 'vendors') return `/inventory/vendors/${parent.id}`;
  return `/${parent.type}/${parent.id}`;
}

/** The second line: the facts the server sent, worded state, money and phone. */
function detailOf(hit: SearchHit, words: StateWords): string {
  const state = hit.state ? words(hit.type, hit.state) : null;
  const phone = hit.phone ? formatPhone(hit.phone) : null;
  const money = hit.amountPaise === null ? null : formatInr(hit.amountPaise);
  switch (hit.type) {
    case 'projects':
      return line(...hit.facts, hit.state !== 'active' && state);
    case 'customers':
    case 'contractors':
    case 'vendors':
      return line(phone, ...hit.facts, hit.state === 'archived' && state);
    case 'leads':
      return line(state, ...hit.facts, phone);
    case 'quotations':
    case 'payments':
      return line(...hit.facts, state, money);
    case 'documents':
      return line(state, ...hit.facts);
    default:
      return line(...hit.facts, state);
  }
}

export function entryOf(hit: SearchHit, words: StateWords): SearchEntry {
  return {
    id: `${hit.type}:${hit.id}`,
    group: hit.type,
    title: hit.title,
    detail: detailOf(hit, words),
    href: hrefOf(hit),
    icon: ICONS[hit.type],
    haystack: '',
    keys: [],
  };
}
