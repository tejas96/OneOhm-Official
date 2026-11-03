/** The file name a document PDF goes by: its number with '/' as '-', plus '-R2' etc. for a revision. */
export function pdfFileName(number: string, revision = 1): string {
  return `${number.replaceAll('/', '-')}${revision > 1 ? `-R${revision}` : ''}.pdf`;
}
