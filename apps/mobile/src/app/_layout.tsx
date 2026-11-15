import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from 'react-native';
import { ApiError } from '@myfinances/api-client';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { useColors } from '../lib/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

function RootNavigator() {
  const { status, workspace } = useAuth();
  const c = useColors();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  // Without a workspace, the first screen available is "welcome": create a household or join one.
  const hasWorkspace = signedIn && workspace !== null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={hasWorkspace}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="expense" options={{ presentation: 'modal', headerShown: true, title: 'Expense' }} />
        <Stack.Screen name="entry" options={{ presentation: 'modal', headerShown: true, title: 'Entry' }} />
        <Stack.Screen name="household" options={{ headerShown: true, title: 'Household' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="welcome" options={{ headerShown: hasWorkspace, title: 'Add a household' }} />
        <Stack.Screen name="account" options={{ headerShown: true, title: 'Account' }} />
        <Stack.Screen name="admin" options={{ headerShown: true, title: 'Site admin' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
