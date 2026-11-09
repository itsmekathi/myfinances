import type { ExpoConfig } from 'expo/config';

// iOS Google Sign-In needs the "reversed" iOS client ID as a URL scheme.
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const iosUrlScheme = iosClientId
  ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

const config: ExpoConfig = {
  name: 'MyFinances',
  slug: 'myfinances',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'myfinances',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.myfinances.app',
    icon: './assets/expo.icon',
  },
  android: {
    package: 'com.myfinances.app',
    adaptiveIcon: {
      backgroundColor: '#E0E7FF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#4F46E5', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow MyFinances to attach photos of bills and receipts.',
        cameraPermission: 'Allow MyFinances to take photos of bills and receipts.',
      },
    ],
    'expo-document-picker',
    // The plugin requires iosUrlScheme. On Android the native module autolinks without it.
    ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, object]] : []),
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
