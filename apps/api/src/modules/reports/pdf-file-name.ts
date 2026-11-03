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
  kind: 'quote' | 'estimate' | 'receipt',
  revision = 1,
): string {
  const name = titleCaseName(customerName)
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const parts = ['OneOhm', name, kind, revision > 1 ? `R${revision}` : ''];
  return `${parts.filter(Boolean).join('-')}.pdf`;
}
