import { DARK_COLORS, LIGHT_COLORS, type ThemeColors } from '@oneohm/design-system/tokens';

type Style = google.maps.MapTypeStyle;

/**
 * A quiet road map in the app's own colours: land on the canvas, roads as soft lines, water
 * in the accent's soft tint, parks in the energy tint, and no shops, pins or transit. Built
 * from the theme tokens, so the map changes with the app's light and dark themes.
 */
function styleFor(colors: ThemeColors, dark: boolean): Style[] {
  const road = dark ? colors.borderStrong : colors.surfaceRaised;
  const arterial = dark ? colors.borderStrong : colors.borderSubtle;
  return [
    { elementType: 'geometry', stylers: [{ color: dark ? colors.surface : colors.canvas }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: colors.textTertiary }] },
    {
      elementType: 'labels.text.stroke',
      stylers: [{ color: dark ? colors.surface : colors.canvas }, { weight: 3 }],
    },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ visibility: 'on' }, { color: colors.energySoft }],
    },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    {
      featureType: 'administrative',
      elementType: 'geometry.stroke',
      stylers: [{ color: colors.borderStrong }],
    },
    {
      featureType: 'landscape.man_made',
      elementType: 'geometry',
      stylers: [{ color: dark ? colors.surfaceRaised : colors.surface }],
    },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: road }] },
    {
      featureType: 'road.arterial',
      elementType: 'geometry',
      stylers: [{ color: arterial }],
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: dark ? colors.borderStrong : colors.surfaceSunken }],
    },
    { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: colors.accentSoft }] },
    {
      featureType: 'water',
      elementType: 'labels.text.fill',
      stylers: [{ color: colors.onAccentSoft }],
    },
  ];
}

export const LIGHT_MAP_STYLE = styleFor(LIGHT_COLORS, false);
export const DARK_MAP_STYLE = styleFor(DARK_COLORS, true);
