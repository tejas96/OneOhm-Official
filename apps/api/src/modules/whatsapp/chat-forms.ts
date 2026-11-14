import type { ChatForm } from '@oneohm/api-contracts';

type ChatFileOut = NonNullable<ChatForm['files'][number]>;

interface Row {
  readonly id: string;
  readonly data: unknown;
  readonly file: ChatFileOut | null;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The form cards of a chat page and the file rows they take in. A file row names its form
 * (`data.formMessageId`); it is hidden only when that form is in the page, so a file is never
 * lost from view. Rows from before forms had data are left as they are.
 */
export function formsOf(rows: readonly Row[]) {
  const forms = new Map<string, ChatForm>();
  for (const row of rows) {
    const form = asObject(asObject(row.data)?.form);
    if (!form || typeof form.key !== 'string') continue;
    const link = asObject(form.link);
    forms.set(row.id, {
      key: form.key,
      title: typeof form.title === 'string' ? form.title : 'Form',
      rows: Array.isArray(form.rows)
        ? form.rows.flatMap((one) => {
            const entry = asObject(one);
            return entry && typeof entry.label === 'string' && typeof entry.value === 'string'
              ? [{ label: entry.label, value: entry.value }]
              : [];
          })
        : [],
      files: [],
      ...(link && typeof link.kind === 'string' && typeof link.id === 'string'
        ? { link: link as unknown as NonNullable<ChatForm['link']> }
        : {}),
    });
  }
  const grouped = new Set<string>();
  // Oldest first, so a card lists its files in the order they were sent.
  for (const row of [...rows].reverse()) {
    const owner = asObject(row.data)?.formMessageId;
    const card = typeof owner === 'string' ? forms.get(owner) : undefined;
    if (!card) continue;
    if (row.file) card.files.push(row.file);
    grouped.add(row.id);
  }
  return { forms, grouped };
}
