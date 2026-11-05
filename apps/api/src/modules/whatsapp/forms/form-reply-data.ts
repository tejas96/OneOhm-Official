import { SURVEY_ANSWERS, SURVEY_PHOTOS } from '@oneohm/domain';

/** What the problem, refer-a-friend and UPI forms post by name (phase 6). */
const CARE_ANSWERS = ['home', 'what', 'since', 'note', 'friend', 'mobile', 'city', 'upi'] as const;

/** The most files one "Send a paper" reply takes (4 photos, or 2 PDFs). */
export const MAX_FORM_FILES = 4;

/**
 * A file in a form reply. Without a data endpoint WhatsApp posts each file as an ordinary media
 * id with its name, type and SHA-256 (base64), and the file is downloaded like any chat file.
 */
export interface FormFile {
  readonly id: string;
  readonly fileName: string | null;
  readonly mimeType: string | null;
  /** WhatsApp's SHA-256 of the file; checked against the downloaded bytes when present. */
  readonly sha256: string | null;
}

/** What a customer sent back in a form (`nfm_reply`): our token and the files. */
export interface IncomingForm {
  readonly token: string | null;
  readonly files: readonly FormFile[];
  /** The "I paid another way" form: the amount typed (digits) and the day picked. */
  readonly amount: string | null;
  readonly date: string | null;
  /** The self-survey form: typed and picked answers by name, and the one photo of each photo screen. */
  readonly answers: Readonly<Record<string, string>>;
  readonly named: Readonly<Record<string, FormFile>>;
  /** The top-level keys of the reply, kept for the log when no file could be read. */
  readonly keys: readonly string[];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** A typed or picked value, whether the form posts it as text or as a number. */
const scalar = (value: unknown): string | null =>
  typeof value === 'number' ? String(value) : text(value)?.trim() || null;

function readFile(raw: unknown): FormFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const id = text(entry.id);
  if (!id) return null;
  return {
    id,
    fileName: text(entry.file_name),
    mimeType: text(entry.mime_type),
    sha256: text(entry.sha256),
  };
}

/** The screens' pickers: photos (SEND_PAPER), pdfs (SEND_PDF), and `files` (the first version). */
const PICKERS = ['photos', 'pdfs', 'files'] as const;

/** The form reply in a message's `response_json` (a JSON string); an empty one when unreadable. */
export function readForm(responseJson: unknown): IncomingForm {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = typeof responseJson === 'string' ? JSON.parse(responseJson) : null;
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: no token and no files.
  }
  const files = PICKERS.flatMap((name) => {
    const list = data[name];
    return Array.isArray(list) ? list.flatMap((raw) => readFile(raw) ?? []) : [];
  }).slice(0, MAX_FORM_FILES);
  const answers: Record<string, string> = {};
  for (const key of [...SURVEY_ANSWERS, ...CARE_ANSWERS]) {
    const value = scalar(data[key]);
    if (value) answers[key] = value;
  }
  const named: Record<string, FormFile> = {};
  for (const key of SURVEY_PHOTOS) {
    const list = data[key];
    // One photo per screen: a one-item list (or the item itself).
    const file = readFile(Array.isArray(list) ? list[0] : list);
    if (file) named[key] = file;
  }
  return {
    answers,
    named,
    token: text(data.flow_token),
    files,
    amount: scalar(data.amount),
    date: scalar(data.date),
    keys: Object.keys(data),
  };
}

/** What the chat shows for a form reply ("Sent a form (2 files)"). */
export const formText = (form: IncomingForm): string =>
  `Sent a form (${form.files.length} ${form.files.length === 1 ? 'file' : 'files'})`;
