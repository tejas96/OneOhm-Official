/** expo-maps draws Apple Maps only from iOS 17; on older iOS the view stays empty. */
const MIN_IOS_MAJOR = 17;

/**
 * Whether this phone may show the satellite map (expo-maps). iOS uses Apple Maps, which
 * needs no key, so it is on from iOS 17 (`extra.mapsEnabledIos`, always set). Android uses
 * Google Maps, on only when its key was set at build time (`extra.mapsEnabledAndroid`).
 * Never on the web.
 */
export function mapsOn(
  os: string,
  extra: Record<string, unknown> | undefined,
  osVersion: string | number = '',
): boolean {
  if (os === 'ios') {
    const major = Number.parseInt(String(osVersion), 10);
    return extra?.mapsEnabledIos === true && major >= MIN_IOS_MAJOR;
  }
  if (os === 'android') return extra?.mapsEnabledAndroid === true;
  return false;
}
