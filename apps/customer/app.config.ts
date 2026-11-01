import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * OneOhm, the customer app (Continuous Native Generation: `ios/` and `android/` are
 * generated from this file by `expo prebuild` and are not committed).
 *
 * The API address comes from EXPO_PUBLIC_API_URL at build time, for example
 * https://app.oneohm.in/api in production or http://<laptop-ip>:4200 on a phone in dev.
 */
const APP_ID = 'in.oneohm.customer';
/** Set in EAS (or .env) once the Expo project exists; push updates need both. */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const GOOGLE_SERVICES_JSON = process.env.GOOGLE_SERVICES_JSON;
const LIGHT_CANVAS = '#F5F6F8';
const DARK_CANVAS = '#0F1113';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'OneOhm',
  slug: 'oneohm-customer',
  scheme: 'oneohm',
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
  },
  android: {
    package: APP_ID,
    versionCode: 1,
    ...(GOOGLE_SERVICES_JSON ? { googleServicesFile: GOOGLE_SERVICES_JSON } : {}),
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
  extra: { ...config.extra, ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}) },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-notifications', { color: '#0B6FA4', defaultChannel: 'default' }],
    'expo-sharing',
    [
      'expo-image-picker',
      {
        cameraPermission:
          'OneOhm uses the camera so you can show us a problem with your solar system.',
        photosPermission:
          'OneOhm uses your photos so you can show us a problem with your solar system.',
        microphonePermission: 'OneOhm records sound with a short video of the problem.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'OneOhm uses the microphone so you can describe a problem in a voice note.',
      },
    ],
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
