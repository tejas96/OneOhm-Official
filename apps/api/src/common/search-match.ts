import { and, ilike, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { likeTerm } from './paging';

/** The ways one typed word can match: as written, as phone digits, as a code without dashes. */
export interface WordForms {
  readonly like: string;
  /** Set when the word is a number of at least 4 digits ("98765", "+91-98765"). */
  readonly digits: string | null;
  /** The word without dashes or slashes, matched against codes without theirs ("oh2026002"). */
  readonly bare: string | null;
}

export function wordForms(word: string): WordForms {
  const compact = word.replace(/[\s()+-]/g, '');
  const digits = /^\d{4,}$/.test(compact) ? compact : null;
  const stripped = word.replace(/[-/]/g, '');
  return {
    like: likeTerm(word),
    digits: digits ? `%${digits}%` : null,
    bare: stripped.length >= 2 ? likeTerm(stripped) : null,
  };
}

export interface MatchColumns {
  /** Names, places, titles, numbers as written. */
  readonly text: readonly SQLWrapper[];
  /** Phone numbers kept as +91…, compared digit for digit. */
  readonly phones?: readonly SQLWrapper[];
  /** Codes with dashes, compared with the dashes left out too. */
  readonly codes?: readonly SQLWrapper[];
}

function matchWord(word: string, columns: MatchColumns): SQL {
  const forms = wordForms(word);
  const parts: SQL[] = [...columns.text, ...(columns.codes ?? [])].map((column) =>
    ilike(column as SQL, forms.like),
  );
  if (forms.digits)
    for (const phone of columns.phones ?? [])
      parts.push(sql`regexp_replace(coalesce(${phone}, ''), '\\D', '', 'g') like ${forms.digits}`);
  if (forms.bare)
    for (const code of columns.codes ?? [])
      parts.push(sql`translate(coalesce(${code}, ''), '-/', '') ilike ${forms.bare}`);
  return or(...parts) ?? sql`false`;
}

/** Every word must appear in one of the columns (any order): "patil miraj" finds Patil in Miraj. */
export function matchWords(words: readonly string[], columns: MatchColumns): SQL | undefined {
  if (words.length === 0) return undefined;
  return and(...words.map((word) => matchWord(word, columns)));
}

/**
 * 0 when a name or code starts with the search, 1 when it contains it, 2 otherwise:
 * the order results show in, before recency.
 */
export function matchRank(search: string, columns: readonly SQLWrapper[]): SQL {
  const starts = `${likeTerm(search).slice(1)}`;
  const contains = likeTerm(search);
  const cases = columns.map(
    (column) =>
      sql`case when ${column} ilike ${starts} then 0 when ${column} ilike ${contains} then 1 else 2 end`,
  );
  return sql`least(${sql.join(cases, sql`, `)})`;
}
