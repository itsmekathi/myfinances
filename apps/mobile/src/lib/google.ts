type GoogleModule = typeof import('@react-native-google-signin/google-signin');

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const googleEnabled = Boolean(webClientId);

// Loaded only when configured: the native module doesn't exist in Expo Go,
// so password sign-in keeps working there.
const google: GoogleModule | null = googleEnabled
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@react-native-google-signin/google-signin')
  : null;

// webClientId is what makes Google include an ID token our API can verify.
google?.GoogleSignin.configure({ webClientId, iosClientId });

/** Returns a Google ID token, or null if the user cancelled. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!google) throw new Error('Google sign-in is not configured');
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, isSuccessResponse, statusCodes } = google;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (isCancelledResponse(res)) return null;
    if (!isSuccessResponse(res) || !res.data.idToken) throw new Error('Google did not return an ID token');
    return res.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is not available on this device');
      }
    }
    throw e;
  }
}

export async function googleSignOut() {
  await google?.GoogleSignin.signOut().catch(() => undefined);
}
