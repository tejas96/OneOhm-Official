/*
 * The three faces from the type tokens (same as Lintel), bundled with the app so builds
 * and pages never depend on Google Fonts. Newsreader keeps its optical-size axis.
 * `.oh-fonts` (globals.css) maps them onto the variables named in FONT_FACE_VARIABLES
 * (packages/design-system/src/theme-css).
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader/standard.css';
import '@fontsource-variable/newsreader/standard-italic.css';

export const FONT_CLASS = 'oh-fonts';
