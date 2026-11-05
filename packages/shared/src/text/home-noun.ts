// How a customer message joins a home's name with the word "home" (en / mr / hi). A home called
// "Home" (or "Farm home", "Sangli house", "घर") must not read "Home home".

/** The label is only the word for a home: "Home", "House", "My home", "घर", "माझे घर". */
const BARE = new Set([
  'home',
  'house',
  'my home',
  'my house',
  'our home',
  'our house',
  'ghar',
  'घर',
  'माझे घर',
  'आमचे घर',
  'मेरा घर',
  'अपना घर',
  'हमारा घर',
]);

const norm = (label: string) => label.trim().replace(/\s+/gu, ' ').toLowerCase();

/** The label is only the word for a home. */
export const isBareHomeWord = (label: string): boolean => BARE.has(norm(label));

/** The label already says "home" or "house" ("Farm home", "Sangli house", "सांगली घर"). */
export const namesHome = (label: string): boolean =>
  /(^|[^\p{L}])(home|house|ghar)([^\p{L}]|$)/iu.test(label) || label.includes('घर');

/** English, after "your": "home" | "Sangli house" | "Farm home". Empty label: "home". */
export function homeEn(label: string | null | undefined): string {
  const name = (label ?? '').trim();
  if (!name || isBareHomeWord(name)) return 'home';
  return namesHome(name) ? name : `${name} home`;
}

/**
 * Hindi noun phrase, before a postposition: "घर" | "Sangli घर" (`joiner` "वाले": "Sangli वाले
 * घर"). The label is printed once.
 */
export function homeHi(label: string | null | undefined, joiner = ''): string {
  const name = (label ?? '').trim();
  if (!name || isBareHomeWord(name)) return 'घर';
  if (namesHome(name)) return name;
  return joiner ? `${name} ${joiner} घर` : `${name} घर`;
}

/**
 * Marathi: the label, then the inflected word for home (`tail`: "घराचे", "घरासाठी", "घरी",
 * "येथील घरासाठी"). A bare label drops the name; a label that already says home keeps only the
 * ending of `tail` ("Farm home चे").
 */
export function homeMr(label: string | null | undefined, tail: string): string {
  const name = (label ?? '').trim();
  if (!name || isBareHomeWord(name)) return tail.replace(/^येथील\s+/u, '');
  if (!namesHome(name)) return `${name} ${tail}`;
  const ending = tail.replace(/^येथील\s+/u, '').replace(/^घर[ाी]?/u, '');
  return ending ? `${name} ${ending}` : name;
}
