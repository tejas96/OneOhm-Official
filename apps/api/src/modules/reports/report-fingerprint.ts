import { createHash } from 'node:crypto';
import { templateVariables } from './report-handlebars';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/** The signature and stamp images a report prints (null: the bundled seal). */
export interface ReportImages {
  readonly signature: string | null;
  readonly stamp: string | null;
}

const printed = new Map<string, { names: readonly string[]; template: string }>();

/** Every name the template prints except the print date, and the template's own digest. */
function printedNames(source: string) {
  let entry = printed.get(source);
  if (!entry) {
    const names = [...templateVariables(source)]
      .filter((name) => name !== 'generated_on' && !name.startsWith('__'))
      .sort();
    entry = { names, template: digest(source) };
    printed.set(source, entry);
  }
  return entry;
}

/**
 * Changes whenever anything the printed report shows changes: every value its template
 * reads (facts, company details, values worked out from the project), the template
 * itself and the signature images. The print date alone never makes a new copy.
 */
export function reportFingerprint(
  format: { readonly key: string; readonly body: string },
  values: Readonly<Record<string, string>>,
  images: ReportImages,
): string {
  const { names, template } = printedNames(format.body);
  return digest({
    key: format.key,
    template,
    values: names.map((name) => [name, values[name]?.trim() ?? '']),
    images: digest([images.signature, images.stamp]),
  });
}

/** The fingerprint a saved copy was made from, kept at the end of its file key. */
export function savedFingerprint(storageKey: string): string | null {
  return /-([0-9a-f]{16})\.pdf$/.exec(storageKey)?.[1] ?? null;
}
