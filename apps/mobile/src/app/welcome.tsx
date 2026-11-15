import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ROLE_LABELS, type JoinRequestDto, type WorkspaceSearchResultDto } from '@myfinances/shared';
import { useAuth } from '../auth/AuthProvider';
import { useColors } from '../lib/theme';
import { Button, Card, ErrorText, TextField } from '../components/ui';
import {
  useCancelJoinRequest,
  useCreateWorkspace,
  useMyJoinRequests,
  useRequestToJoin,
  useWorkspaceSearch,
} from '../hooks/households';

type Mode = 'create' | 'join';

/** After sign-up (and from Household): create a household or ask to join one. */
export default function WelcomeScreen() {
  const c = useColors();
  const { user, workspaces, logout } = useAuth();
  const { data: requests = [] } = useMyJoinRequests();
  const [mode, setMode] = useState<Mode>('create');
  const first = workspaces.length === 0;

  return (
    <SafeAreaView edges={first ? ['top', 'bottom'] : ['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
          {first && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: c.text, fontSize: 24, fontWeight: '700' }}>
                  Welcome{user?.displayName ? `, ${user.displayName}` : ''}
                </Text>
                <Text style={{ color: c.muted, fontSize: 14 }}>
                  Set up a household to start tracking, or join one that already exists.
                </Text>
              </View>
              <Pressable onPress={() => void logout()} hitSlop={12} accessibilityLabel="Sign out">
                <Ionicons name="log-out-outline" size={24} color={c.muted} />
              </Pressable>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <ModeCard
              active={mode === 'create'}
              onPress={() => setMode('create')}
              icon="home"
              title="Create a household"
              text="You'll be its owner."
            />
            <ModeCard
              active={mode === 'join'}
              onPress={() => setMode('join')}
              icon="people"
              title="Join one"
              text="Ask its admins to let you in."
            />
          </View>

          {mode === 'create' ? <CreateHousehold /> : <JoinHousehold />}
          {requests.length > 0 && <MyRequests requests={requests} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeCard({
  active,
  onPress,
  icon,
  title,
  text,
}: {
  active: boolean;
  onPress: () => void;
  icon: 'home' | 'people';
  title: string;
  text: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={{
        flex: 1,
        gap: 8,
        padding: 14,
        borderRadius: 16,
        borderWidth: active ? 2 : 1,
        borderColor: active ? c.brand : c.border,
        backgroundColor: c.card,
      }}
    >
      <Ionicons name={icon} size={22} color={active ? c.brand : c.muted} />
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>{text}</Text>
    </Pressable>
  );
}

function CreateHousehold() {
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');

  async function submit() {
    try {
      await create.mutateAsync({ name, baseCurrency: currency });
      router.replace('/');
    } catch {
      // Shown below via create.error.
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <TextField label="Household name" placeholder="e.g. The Sharma Family" value={name} onChangeText={setName} maxLength={80} />
      <TextField
        label="Currency"
        value={currency}
        onChangeText={(t) => setCurrency(t.toUpperCase())}
        autoCapitalize="characters"
        maxLength={3}
      />
      <ErrorText error={create.error} />
      <Button
        title="Create household"
        onPress={() => void submit()}
        loading={create.isPending}
        disabled={!name.trim() || currency.length !== 3}
      />
    </Card>
  );
}

function adminNames(w: WorkspaceSearchResultDto): string {
  if (!w.admins.length) return 'No admin';
  return w.admins.map((a) => `${a.displayName ?? 'Unnamed'}${a.role === 'owner' ? ' (owner)' : ''}`).join(', ');
}

function JoinHousehold() {
  const c = useColors();
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');
  const search = useWorkspaceSearch(q);
  const ask = useRequestToJoin();
  const tooShort = q.trim().length < 2;

  return (
    <Card style={{ gap: 12 }}>
      <TextField label="Search households" placeholder="Household name" value={q} onChangeText={setQ} autoCorrect={false} />
      <TextField label="Message to the admins (optional)" value={message} onChangeText={setMessage} maxLength={280} />
      <ErrorText error={ask.error ?? search.error} />
      {tooShort ? (
        <Text style={{ color: c.muted }}>Type at least 2 characters to search.</Text>
      ) : search.isLoading ? (
        <ActivityIndicator color={c.brand} />
      ) : search.data?.length ? (
        search.data.map((w) => (
          <View
            key={w.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: c.border }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
                {w.name}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={2}>
                Admin: {adminNames(w)} · {w.memberCount} {w.memberCount === 1 ? 'member' : 'members'}
              </Text>
            </View>
            {w.myRole ? (
              <Text style={{ color: c.muted, fontSize: 13 }}>You're {ROLE_LABELS[w.myRole].toLowerCase()}</Text>
            ) : w.myRequestStatus === 'pending' ? (
              <Text style={{ color: c.investment, fontSize: 13, fontWeight: '600' }}>Requested</Text>
            ) : (
              <Button
                title="Ask to join"
                variant="secondary"
                style={{ height: 38 }}
                loading={ask.isPending && ask.variables?.workspaceId === w.id}
                onPress={() => ask.mutate({ workspaceId: w.id, message })}
              />
            )}
          </View>
        ))
      ) : (
        <Text style={{ color: c.muted }}>No households match “{q.trim()}”.</Text>
      )}
    </Card>
  );
}

function MyRequests({ requests }: { requests: JoinRequestDto[] }) {
  const c = useColors();
  const { workspaces, refreshProfile, selectWorkspace } = useAuth();
  const cancel = useCancelJoinRequest();

  // An approval arrives by polling: load the new workspace so it can be opened.
  const approvedMissing = requests.some(
    (r) => r.status === 'approved' && !workspaces.some((w) => w.id === r.workspace.id),
  );
  useEffect(() => {
    if (approvedMissing) void refreshProfile();
  }, [approvedMissing, refreshProfile]);

  return (
    <Card style={{ gap: 4 }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Your requests</Text>
      <ErrorText error={cancel.error} />
      {requests.map((r) => {
        const member = workspaces.some((w) => w.id === r.workspace.id);
        return (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                {r.workspace.name}
              </Text>
              <Text style={{ color: c.muted, fontSize: 12, textTransform: 'capitalize' }}>
                {r.status === 'pending' ? 'Waiting for approval' : r.status}
              </Text>
            </View>
            {r.status === 'pending' && (
              <Button
                title="Cancel"
                variant="secondary"
                style={{ height: 38 }}
                loading={cancel.isPending && cancel.variables === r.id}
                onPress={() => cancel.mutate(r.id)}
              />
            )}
            {r.status === 'approved' && member && (
              <Button
                title="Open"
                style={{ height: 38 }}
                onPress={() => {
                  selectWorkspace(r.workspace.id);
                  router.replace('/');
                }}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}
