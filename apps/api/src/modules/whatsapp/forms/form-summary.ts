import { DEFAULT_ONBOARDING } from '@oneohm/domain';
import { PROBLEM_LISTS } from '../../care/problem-words';
import type { FormKey } from './form-registry';
import type { IncomingForm } from './form-reply-data';
import { dayFrom, paiseFrom } from './paid-parse';

/** One answer as staff read it: an English label and a readable value. */
export interface FormRow {
  readonly label: string;
  readonly value: string;
}

/** Where a form's result can be opened in the staff app. */
export interface FormLink {
  readonly kind: 'service_request' | 'lead' | 'customer' | 'payment' | 'project';
  readonly id: string;
}

/** What is stored on the form-reply chat row (`wa_messages.data`). */
export interface FormData {
  readonly form: {
    readonly key: string;
    readonly title: string;
    readonly rows: readonly FormRow[];
    readonly fileIds: readonly string[];
    readonly link?: FormLink;
  };
}

/** What a summary needs beyond the reply: the token's payload and names looked up by id. */
export interface SummaryContext {
  readonly payload?: Readonly<Record<string, unknown>>;
  /** The name of the home picked in the problem form. */
  readonly home?: string | null;
  /** Bill band labels by id; the default bands when left out. */
  readonly billLabels?: Readonly<Record<string, string>>;
}

const ENGLISH = PROBLEM_LISTS.en;

const SITES: Readonly<Record<string, string>> = {
  home: 'Home',
  society: 'Housing society',
  business: 'Shop or business',
  farm: 'Farm',
};
const ROOFS: Readonly<Record<string, string>> = {
  rcc: 'RCC slab',
  tin: 'Tin sheet',
  tile: 'Tiled roof',
  other: 'Other roof',
};
const SHADES: Readonly<Record<string, string>> = {
  none: 'No shade',
  morning: 'Some shade in the morning',
  evening: 'Some shade in the evening',
  lot: 'A lot of shade',
};
const SIZES: Readonly<Record<string, string>> = {
  s1: 'Under 300 sq ft',
  s2: '300 to 600 sq ft',
  s3: '600 to 1000 sq ft',
  s4: 'Over 1000 sq ft',
  unknown: 'Customer does not know',
};
const DEFAULT_BILLS: Readonly<Record<string, string>> = Object.fromEntries(
  DEFAULT_ONBOARDING.billBands.map((band) => [band.id, band.label]),
);

const word = (table: Readonly<Record<string, string>>, id: string | undefined) =>
  id === undefined ? undefined : (table[id] ?? id);

const floorsText = (id: string | undefined) => {
  if (id === undefined) return undefined;
  if (id === '1') return 'Ground only';
  if (id === '4') return '4 or more floors';
  return /^\d+$/.test(id) ? `${id} floors` : id;
};

/** "paper_front" or "electricity_bill" → "Electricity bill". */
const spoken = (key: string) => {
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

function rowsOf(pairs: ReadonlyArray<readonly [string, string | null | undefined]>): FormRow[] {
  return pairs.flatMap(([label, value]) => {
    const text = value?.trim();
    return text ? [{ label, value: text }] : [];
  });
}

/** The staff rows of one form reply: English labels, readable values, empty ones left out. */
export function formRows(key: FormKey, form: IncomingForm, ctx: SummaryContext = {}): FormRow[] {
  const a = form.answers;
  switch (key) {
    case 'report_problem':
      return rowsOf([
        ['Problem', word(ENGLISH.what, a.what)],
        ['Since', word(ENGLISH.since, a.since)],
        ['Note', a.note],
        ['Home', ctx.home],
      ]);
    case 'refer_friend':
      return rowsOf([
        ['Friend', a.friend],
        ['Mobile', a.mobile],
        ['City', a.city],
      ]);
    case 'share_upi':
      return rowsOf([['UPI ID', a.upi]]);
    case 'paid_another_way': {
      const paise = paiseFrom(form.amount);
      return rowsOf([
        ['Amount', paise === null ? form.amount : rupees(paise)],
        ['Date', dayFrom(form.date) ?? form.date],
      ]);
    }
    case 'self_survey':
      return rowsOf([
        ['Roof', word(ROOFS, a.roof)],
        ['Floors', floorsText(a.floors)],
        ['Shade', word(SHADES, a.shade)],
        ['Roof size', word(SIZES, a.size)],
        ['Consumer no.', a.consumer],
      ]);
    case 'send_paper': {
      const paper = ctx.payload?.paper ?? ctx.payload?.key;
      return rowsOf([['Paper', typeof paper === 'string' ? spoken(paper) : null]]);
    }
    case 'onboarding':
      return rowsOf([
        ['Name', a.name],
        ['City', a.city && !/^other$/i.test(a.city) ? a.city : null],
        ['Other city', a.other_city],
        ['Site', word(SITES, a.site)],
        ['Bill', a.bill ? (ctx.billLabels?.[a.bill] ?? DEFAULT_BILLS[a.bill] ?? a.bill) : null],
        ['Roof', word(ROOFS, a.roof)],
        ['Floors', floorsText(a.floors)],
      ]);
  }
}

/** "2 photos", "1 file"; photos when every file is an image. */
export function filesText(form: IncomingForm): string | null {
  const files = [...form.files, ...Object.values(form.named)];
  if (files.length === 0) return null;
  const photos = files.every((file) => file.mimeType?.startsWith('image/') ?? false);
  const noun = photos ? 'photo' : 'file';
  return `${files.length} ${noun}${files.length === 1 ? '' : 's'}`;
}

/** The one-line fallback in the chat: "Form · Report a problem · No power · 2 photos". */
export function formBody(title: string, rows: readonly FormRow[], form: IncomingForm): string {
  return ['Form', title, rows[0]?.value, filesText(form)].filter(Boolean).join(' · ');
}
