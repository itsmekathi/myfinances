import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  canManageMembers,
  grantableRoles,
  ROLE_LABELS,
  ROLE_RANK,
  type MemberDto,
  type WorkspaceRole,
} from '@myfinances/shared';
import { useAuth, useWorkspace } from '../auth/AuthProvider';
import { useColors } from '../lib/theme';
import { Button, Card, ErrorText } from '../components/ui';
import { JoinRequestCard } from '../components/JoinRequestCard';
import { useMembers, useRemoveMember, useUpdateMember, useWorkspaceJoinRequests } from '../hooks/households';

export default function HouseholdScreen() {
  const c = useColors();
  const ws = useWorkspace();
  const { user, workspaces, selectWorkspace, refreshProfile } = useAuth();
  const manage = canManageMembers(ws.role);
  const members = useMembers(ws.id);
  const requests = useWorkspaceJoinRequests(ws.id, manage);
  const update = useUpdateMember(ws.id);
  const remove = useRemoveMember(ws.id);

  const isMe = (m: MemberDto) => m.userId === user?.id;
  const canEdit = (m: MemberDto) => manage && !isMe(m) && ROLE_RANK[m.role] < ROLE_RANK[ws.role];
  const name = (m: MemberDto) => m.displayName ?? m.email;

  function editMember(m: MemberDto) {
    const roles: WorkspaceRole[] = grantableRoles(ws.role).filter((r) => r !== m.role);
    Alert.alert(name(m), `Currently ${ROLE_LABELS[m.role].toLowerCase()}.`, [
      ...roles.map((role) => ({
        text: `Make ${ROLE_LABELS[role].toLowerCase()}`,
        onPress: () => update.mutate({ userId: m.userId, role }),
      })),
      ...(ws.role === 'owner'
        ? [
            {
              text: 'Transfer ownership',
              onPress: () =>
                Alert.alert('Transfer ownership?', `${name(m)} becomes the owner and you become an admin.`, [
                  { text: 'Cancel', style: 'cancel' as const },
                  { text: 'Transfer', onPress: () => update.mutate({ userId: m.userId, role: 'owner' }) },
                ]),
            },
          ]
        : []),
      { text: 'Remove from household', style: 'destructive' as const, onPress: () => remove.mutate(m.userId) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function leave() {
    Alert.alert(`Leave ${ws.name}?`, 'You will lose access until an admin lets you back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(user!.id);
            await refreshProfile();
            router.replace('/');
          } catch {
            // Shown via remove.error.
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
      <View>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{ws.name}</Text>
        <Text style={{ color: c.muted }}>
          You're {ROLE_LABELS[ws.role].toLowerCase()} · {ws.baseCurrency}
        </Text>
      </View>

      {workspaces.length > 1 && (
        <Card style={{ gap: 4 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Your households</Text>
          {workspaces.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => selectWorkspace(w.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
              accessibilityRole="radio"
              accessibilityState={{ checked: w.id === ws.id }}
            >
              <Ionicons name={w.id === ws.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={c.brand} />
              <Text style={{ color: c.text, flex: 1 }}>{w.name}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{ROLE_LABELS[w.role]}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      <Button title="Create or join another household" variant="secondary" onPress={() => router.push('/welcome')} />

      {manage && (
        <Card style={{ gap: 4 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Requests to join</Text>
          {requests.isLoading ? (
            <ActivityIndicator color={c.brand} />
          ) : requests.data?.length ? (
            requests.data.map((r) => <JoinRequestCard key={r.id} request={r} roles={grantableRoles(ws.role)} />)
          ) : (
            <Text style={{ color: c.muted }}>No pending requests.</Text>
          )}
        </Card>
      )}

      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Members</Text>
        <ErrorText error={members.error ?? update.error ?? remove.error} />
        {members.isLoading ? (
          <ActivityIndicator color={c.brand} />
        ) : (
          members.data?.map((m) => (
            <Pressable
              key={m.userId}
              disabled={!canEdit(m)}
              onPress={() => editMember(m)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                  {name(m)}
                  {isMe(m) ? <Text style={{ color: c.muted, fontWeight: '400' }}> (you)</Text> : null}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>
                  {m.email}
                </Text>
              </View>
              <Text style={{ color: c.muted }}>{ROLE_LABELS[m.role]}</Text>
              {canEdit(m) && <Ionicons name="chevron-forward" size={16} color={c.muted} />}
            </Pressable>
          ))
        )}
      </Card>

      {ws.role !== 'owner' && <Button title="Leave household" variant="danger" onPress={leave} loading={remove.isPending} />}
    </ScrollView>
  );
}
