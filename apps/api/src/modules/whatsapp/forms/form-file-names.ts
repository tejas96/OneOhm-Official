/** What each form's files are, for the name staff see ("Problem photo 1.jpg"). */
const KIND: Readonly<Record<string, string>> = {
  report_problem: 'Problem',
  onboarding: 'Bill',
  send_paper: 'Paper',
  paid_another_way: 'Payment proof',
  self_survey: 'Survey',
};

/** A name made by a machine: a UUID, a long run of hex or digits, or a bare "image". */
const MACHINE_NAME =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,}|\d{6,}|image|file|document|photo)$/i;

/**
 * The readable name for a form file, or null to keep the name it has (one a person gave it, or
 * a form we do not name). `index` counts from 0 within `total` files; one file has no number.
 * "Payment proof" is not followed by "photo"; a PDF is "Paper PDF 1.pdf".
 */
export function readableFileName(
  formKey: string,
  index: number,
  total: number,
  document: { readonly name: string | null; readonly contentType: string | null },
): string | null {
  const kind = KIND[formKey];
  const current = document.name ?? '';
  if (!kind) return null;
  const dot = current.lastIndexOf('.');
  const stem = dot > 0 ? current.slice(0, dot) : current;
  if (current && !MACHINE_NAME.test(stem)) return null;
  const extension = dot > 0 ? current.slice(dot) : '';
  const pdf = document.contentType === 'application/pdf';
  const noun = kind === 'Payment proof' ? '' : pdf ? ' PDF' : ' photo';
  const number = total > 1 ? ` ${index + 1}` : '';
  return `${kind}${noun}${number}${extension}`;
}
