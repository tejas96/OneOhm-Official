/** The papers a lead's customer usually hands over, as document library categories. */
export const PAPER_CATEGORIES = ['electricity_bill', 'customer_kyc', 'property', 'other'] as const;
export type PaperCategory = (typeof PAPER_CATEGORIES)[number];

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * A photographed paper is named for what it is and the day ("Electricity bill
 * 2026-11-01.jpg", numbered when several are taken at once), not "IMG_2041.JPG". A
 * picked file (a PDF) keeps its own name.
 */
export function paperName(
  label: string,
  day: string,
  file: { readonly name: string; readonly type: string },
  index: number,
  count: number,
): string {
  if (!file.type.startsWith('image/')) return file.name;
  const own = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1]?.toLowerCase();
  const extension = own ?? EXTENSION_BY_TYPE[file.type] ?? 'jpg';
  const number = count > 1 ? ` (${index + 1})` : '';
  return `${label} ${day}${number}.${extension}`;
}
