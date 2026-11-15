import { Alert, Text, View } from 'react-native';
import { ROLE_LABELS, type GrantableRole, type JoinRequestDto } from '@myfinances/shared';
import { useColors } from '../lib/theme';
import { Button, ErrorText } from './ui';
import { useDecideJoinRequest } from '../hooks/households';

/** A pending request; Approve asks which role to grant. */
export function JoinRequestCard({
  request: r,
  roles,
  showWorkspace = false,
}: {
  request: JoinRequestDto;
  roles: GrantableRole[];
  showWorkspace?: boolean;
}) {
  const c = useColors();
  const decide = useDecideJoinRequest();
  const who = r.user.displayName ?? r.user.email;

  const approve = () =>
    Alert.alert(`Let ${who} in?`, 'Choose their role.', [
      ...roles.map((role) => ({
        text: ROLE_LABELS[role],
        onPress: () => decide.mutate({ id: r.id, approve: true, role }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  return (
    <View style={{ gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: c.border }}>
      <View>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>
          {who}
          {showWorkspace ? <Text style={{ color: c.muted, fontWeight: '400' }}> → {r.workspace.name}</Text> : null}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>{r.user.email}</Text>
      </View>
      {r.message ? <Text style={{ color: c.text, fontStyle: 'italic' }}>“{r.message}”</Text> : null}
      <ErrorText error={decide.error} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Approve" style={{ flex: 1, height: 40 }} onPress={approve} loading={decide.isPending && decide.variables?.approve} />
        <Button
          title="Reject"
          variant="secondary"
          style={{ flex: 1, height: 40 }}
          onPress={() => decide.mutate({ id: r.id, approve: false })}
          loading={decide.isPending && !decide.variables?.approve}
        />
      </View>
    </View>
  );
}
