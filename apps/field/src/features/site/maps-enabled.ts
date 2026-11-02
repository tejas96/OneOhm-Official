/**
 * Whether this phone may show the Google map: a key for its own platform was set at
 * build time (`extra.mapsEnabledIos` / `extra.mapsEnabledAndroid`). Never on the web.
 */
export function mapsOn(os: string, extra: Record<string, unknown> | undefined): boolean {
  if (os === 'ios') return extra?.mapsEnabledIos === true;
  if (os === 'android') return extra?.mapsEnabledAndroid === true;
  return false;
}
