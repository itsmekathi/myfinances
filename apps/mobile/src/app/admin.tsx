import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { GRANTABLE_ROLES } from '@myfinances/shared';
import { useAuth } from '../auth/AuthProvider';
import { useColors } from '../lib/theme';
import { Card, ErrorText } from '../components/ui';
import { JoinRequestCard } from '../components/JoinRequestCard';
import { useAdminJoinRequests } from '../hooks/households';

/** Site admins: pending requests to join any household. */
export default function AdminScreen() {
  const c = useColors();
  const { user } = useAuth();
  const isAdmin = user?.siteRole === 'admin';
  const requests = useAdminJoinRequests(isAdmin);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Pending requests</Text>
        <ErrorText error={requests.error} />
        {!isAdmin ? (
          <Text style={{ color: c.muted }}>Only site admins can see this page.</Text>
        ) : requests.isLoading ? (
          <ActivityIndicator color={c.brand} />
        ) : requests.data?.length ? (
          requests.data.map((r) => <JoinRequestCard key={r.id} request={r} roles={[...GRANTABLE_ROLES]} showWorkspace />)
        ) : (
          <Text style={{ color: c.muted }}>No pending requests.</Text>
        )}
      </Card>
    </ScrollView>
  );
}
