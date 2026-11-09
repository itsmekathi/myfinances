import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { getGoogleIdToken, googleEnabled } from '../lib/google';
import { useColors } from '../lib/theme';
import { Button, ErrorText, TextField } from '../components/ui';

export default function LoginScreen() {
  const c = useColors();
  const { login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function run(kind: 'form' | 'google', fn: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const submit = () =>
    run('form', () =>
      mode === 'login'
        ? login({ identifier: identifier.trim(), password })
        : register({ email: email.trim(), username: username.trim(), password }),
    );

  const google = () =>
    run('google', async () => {
      const idToken = await getGoogleIdToken();
      if (idToken) await loginWithGoogle(idToken);
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="wallet" size={32} color="#fff" />
            </View>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: '700' }}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={{ color: c.muted, fontSize: 15 }}>Track every expense, effortlessly.</Text>
          </View>

          {googleEnabled && (
            <>
              <Button title="Continue with Google" variant="secondary" onPress={google} loading={busy === 'google'} />
              <Text style={{ color: c.muted, textAlign: 'center' }}>or</Text>
            </>
          )}

          {mode === 'login' ? (
            <TextField label="Email or username" autoCapitalize="none" autoComplete="username" value={identifier} onChangeText={setIdentifier} />
          ) : (
            <>
              <TextField label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
              <TextField label="Username" autoCapitalize="none" autoComplete="username-new" value={username} onChangeText={setUsername} />
            </>
          )}
          <TextField
            label="Password"
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />

          <ErrorText error={error} />

          <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy === 'form'} />

          <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            <Text style={{ color: c.muted, textAlign: 'center', marginTop: 8 }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: c.brand, fontWeight: '600' }}>{mode === 'login' ? 'Sign up' : 'Sign in'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
