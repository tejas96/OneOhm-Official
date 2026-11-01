import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * OneOhm Field (Continuous Native Generation: `ios/` and `android/` are generated
 * from this file by `expo prebuild` and are not committed).
 *
 * The API address comes from EXPO_PUBLIC_API_URL at build time, for example
 * https://app.oneohm.in/api in production or http://<laptop-ip>:4200 on a phone in dev.
 */
const APP_ID = 'in.oneohm.field';
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
  },
  android: {
    package: APP_ID,
    versionCode: 1,
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
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        cameraPermission: 'OneOhm uses the camera to take site photos for your tasks.',
        photosPermission: 'OneOhm uses your photos to attach site photos to your tasks.',
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
