import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Files the documents are built from. They live in `apps/api/assets` (outside `src`, so
 * the same path works from `src` in tests and from `dist` at run time; the production
 * image copies the folder beside `dist`).
 */
const ASSETS = resolve(__dirname, '../../../assets');

const cache = new Map<string, string>();

function cached(key: string, load: () => string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = load();
  cache.set(key, value);
  return value;
}

export function assetText(...parts: string[]): string {
  return cached(`text:${parts.join('/')}`, () => readFileSync(resolve(ASSETS, ...parts), 'utf8'));
}

function dataUri(path: string, mime: string): string {
  return cached(
    `uri:${path}`,
    () => `data:${mime};base64,${readFileSync(path).toString('base64')}`,
  );
}

/** The director's signature with the company seal, printed on every vendor signature. */
export const stampDataUri = () => dataUri(resolve(ASSETS, 'brand/company-stamp.png'), 'image/png');

export const logoDataUri = () => dataUri(resolve(ASSETS, 'brand/oneohm-logo.webp'), 'image/webp');

interface FontFile {
  readonly family: string;
  readonly pkg: string;
  readonly file: string;
  readonly range: 'latin' | 'latinExt';
}

/** Fontsource's subsets: Latin, and Latin Extended (which carries the rupee sign). */
const RANGES = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  latinExt:
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const;

const fontFiles = (family: string, pkg: string, stem: string): FontFile[] => [
  { family, pkg, file: `${stem}-latin-wght-normal.woff2`, range: 'latin' },
  { family, pkg, file: `${stem}-latin-ext-wght-normal.woff2`, range: 'latinExt' },
];

/** Brand faces for the quotation (Newsreader, Geist, Geist Mono). */
const BRAND_FONTS = [
  ...fontFiles('Newsreader', '@fontsource-variable/newsreader', 'newsreader'),
  ...fontFiles('Geist', '@fontsource-variable/geist', 'geist'),
  ...fontFiles('Geist Mono', '@fontsource-variable/geist-mono', 'geist-mono'),
];

/** Open Sans, the face the statutory templates are written for. */
const FORM_FONTS = fontFiles('Open Sans', '@fontsource-variable/open-sans', 'open-sans');

function fontFaces(fonts: readonly FontFile[]): string {
  return fonts
    .map((font) => {
      const src = dataUri(require.resolve(`${font.pkg}/files/${font.file}`), 'font/woff2');
      return `@font-face{font-family:'${font.family}';font-style:normal;font-weight:100 900;font-display:block;src:url(${src}) format('woff2');unicode-range:${RANGES[font.range]};}`;
    })
    .join('\n');
}

export const brandFontCss = () => cached('fonts:brand', () => fontFaces(BRAND_FONTS));
export const formFontCss = () => cached('fonts:form', () => fontFaces(FORM_FONTS));
