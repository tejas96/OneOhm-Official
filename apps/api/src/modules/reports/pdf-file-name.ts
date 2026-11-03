import { titleCaseName } from '@oneohm/shared';

/** The file name a document PDF goes by: its number with '/' as '-', plus '-R2' etc. for a revision. */
export function pdfFileName(number: string, revision = 1): string {
  return `${number.replaceAll('/', '-')}${revision > 1 ? `-R${revision}` : ''}.pdf`;
}

/**
 * The name a PDF goes by in the customer's WhatsApp (live review C16), easy to find again
 * in their media: "OneOhm-Tejas-quote.pdf", "-estimate", "-receipt". Letters in any
 * script stay; everything else becomes one '-'.
 */
export function customerPdfName(
  customerName: string,
  kind: 'quote' | 'estimate' | 'receipt' | 'invoice',
  revision = 1,
): string {
  const name = slug(titleCaseName(customerName));
  const parts = ['OneOhm', name, kind, revision > 1 ? `R${revision}` : ''];
  return `${parts.filter(Boolean).join('-')}.pdf`;
}

/** Letters in any script stay; everything else becomes one '-'. */
const slug = (text: string) =>
  text
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** "OneOhm-Net-meter-agreement.pdf": another paper, by its title and its file type. */
export function paperFileName(title: string, contentType: string): string {
  const extension = EXTENSIONS[contentType];
  const bare = extension ? title.replace(new RegExp(`\\.${extension}$`, 'i'), '') : title;
  const name = ['OneOhm', slug(bare)].filter(Boolean).join('-');
  return extension ? `${name}.${extension}` : name;
}
