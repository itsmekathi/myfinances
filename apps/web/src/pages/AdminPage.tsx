import { Navigate } from 'react-router';
import { GRANTABLE_ROLES } from '@myfinances/shared';
import { useAuth } from '../auth/AuthProvider';
import { Card, ErrorMessage, Spinner } from '../components/ui';
import { JoinRequestRow } from '../components/JoinRequestRow';
import { useAdminJoinRequests } from '../hooks/households';

/** Site admins: every pending join request, for any household. */
export function AdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.siteRole === 'admin';
  const requests = useAdminJoinRequests(isAdmin);
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Site admin</h1>
        <p className="mt-1 text-sm text-slate-500">Pending requests to join any household.</p>
      </div>
      <Card className="space-y-1">
        <ErrorMessage error={requests.error} />
        {requests.isLoading ? (
          <Spinner className="size-5" />
        ) : requests.data?.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Pending requests">
            {requests.data.map((r) => (
              <JoinRequestRow key={r.id} request={r} roles={[...GRANTABLE_ROLES]} showWorkspace />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No pending requests.</p>
        )}
      </Card>
    </div>
  );
}
