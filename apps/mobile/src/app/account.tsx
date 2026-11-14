import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useColors } from '../lib/theme';
import { Button, Card, ErrorText, TextField } from '../components/ui';

const providerLabel: Record<string, string> = { password: 'Email and password', google: 'Google' };

export default function AccountScreen() {
  const c = useColors();
  const { user, deleteAccount } = useAuth();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!user) return null;

  const emailMatches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const ready = emailMatches && (!user.hasPassword || password.length > 0);

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'Your workspace and all its expenses, categories and attachments will be deleted permanently. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setBusy(true);
            try {
              // On success the auth state becomes signedOut and the router shows login.
              await deleteAccount({ confirmEmail, password: user!.hasPassword ? password : undefined });
            } catch (e) {
              setError(e);
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  const row = (label: string, value: string) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 12 }}>
          {row('Name', user.displayName ?? '—')}
          {row('Email', user.email)}
          {user.username ? row('Username', user.username) : null}
          {row('Sign-in methods', user.providers.map((p) => providerLabel[p] ?? p).join(', '))}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.danger, fontSize: 17, fontWeight: '700' }}>Delete account</Text>
          <Text style={{ color: c.muted, fontSize: 14 }}>
            Permanently deletes your account, your workspace, and all its expenses, categories and attachments.
          </Text>
          <TextField
            label={`Type your email (${user.email}) to confirm`}
            value={confirmEmail}
            onChangeText={setConfirmEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          {user.hasPassword && (
            <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          )}
          <ErrorText error={error} />
          <Button title="Delete my account" variant="danger" onPress={confirmDelete} loading={busy} disabled={!ready} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
