import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * OneOhm Field (Continuous Native Generation: `ios/` and `android/` are generated
 * from this file by `expo prebuild` and are not committed).
 *
 * The API address comes from EXPO_PUBLIC_API_URL at build time, for example
 * https://app.oneohm.in/api in production or http://<laptop-ip>:4200 on a phone in dev.
 */
const APP_ID = 'in.oneohm.field';
/** Set in EAS (or .env) once the Expo project exists; push alerts need both. */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const GOOGLE_SERVICES_JSON = process.env.GOOGLE_SERVICES_JSON;
/** Google Maps keys: a per-platform key wins, then the shared development key. */
const MAPS_SHARED_KEY = process.env.GOOGLE_MAPS_API_KEY || undefined;
const MAPS_ANDROID_KEY = process.env.GOOGLE_MAPS_ANDROID_KEY || MAPS_SHARED_KEY;
const MAPS_IOS_KEY = process.env.GOOGLE_MAPS_IOS_KEY || MAPS_SHARED_KEY;
const LIGHT_CANVAS = '#F5F6F8';
const DARK_CANVAS = '#0F1113';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'OneOhm Field',
  slug: 'oneohm-field',
  scheme: 'oneohm-field',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: LIGHT_CANVAS,
  ios: {
    bundleIdentifier: APP_ID,
    buildNumber: '1',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
    ...(MAPS_IOS_KEY ? { config: { googleMapsApiKey: MAPS_IOS_KEY } } : {}),
  },
  android: {
    package: APP_ID,
    versionCode: 1,
    ...(GOOGLE_SERVICES_JSON ? { googleServicesFile: GOOGLE_SERVICES_JSON } : {}),
    ...(MAPS_ANDROID_KEY ? { config: { googleMaps: { apiKey: MAPS_ANDROID_KEY } } } : {}),
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  web: { favicon: './assets/images/favicon.png', output: 'single' },
  extra: {
    ...config.extra,
    // Per platform: an iOS build without its key must not show the Google map.
    mapsEnabledIos: Boolean(MAPS_IOS_KEY),
    mapsEnabledAndroid: Boolean(MAPS_ANDROID_KEY),
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-notifications', { color: '#0B6FA4', defaultChannel: 'default' }],
    'expo-sharing',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'OneOhm reads your location only when you check in or out, to confirm you are at an approved place.',
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'OneOhm uses the camera to take site photos and videos for your work.',
        photosPermission: 'OneOhm uses your photos to attach site photos and videos to your work.',
        microphonePermission: 'OneOhm records sound with the site videos you take.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'OneOhm uses the microphone to record voice notes about your site work.',
      },
    ],
    [
      // Notes spoken instead of typed (PRD 4.4); the browser's Web Speech API on the web.
      'expo-speech-recognition',
      {
        microphonePermission:
          'OneOhm uses the microphone to record voice notes and to turn what you say into text for your notes.',
        speechRecognitionPermission:
          'OneOhm turns what you say into text for your task notes. You can check and edit it before saving.',
      },
    ],
    // react-native-maps: on iOS the Google map needs its pods and key at start-up, which
    // only this plugin adds. Android reads the key from `android.config.googleMaps`.
    ['react-native-maps', MAPS_IOS_KEY ? { iosGoogleMapsApiKey: MAPS_IOS_KEY } : {}],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
        resizeMode: 'contain',
        backgroundColor: LIGHT_CANVAS,
        dark: { image: './assets/images/splash-icon.png', backgroundColor: DARK_CANVAS },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
