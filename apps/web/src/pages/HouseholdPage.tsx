import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LogOut, Plus, UserMinus } from 'lucide-react';
import {
  canManageMembers,
  grantableRoles,
  ROLE_LABELS,
  ROLE_RANK,
  type MemberDto,
  type WorkspaceRole,
} from '@myfinances/shared';
import { useAuth, useWorkspace } from '../auth/AuthProvider';
import { Button, Card, ErrorMessage, Modal, Select, Spinner } from '../components/ui';
import { JoinRequestRow } from '../components/JoinRequestRow';
import { useMembers, useRemoveMember, useUpdateMember, useWorkspaceJoinRequests } from '../hooks/households';

const ROLE_HELP: Record<WorkspaceRole, string> = {
  owner: 'Everything, including transferring ownership',
  admin: 'Add and edit records; approve requests; manage editors and viewers',
  editor: 'Add and edit records',
  viewer: 'Read only',
};

export function HouseholdPage() {
  const ws = useWorkspace();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const manage = canManageMembers(ws.role);
  const members = useMembers(ws.id);
  const requests = useWorkspaceJoinRequests(ws.id, manage);
  const update = useUpdateMember(ws.id);
  const remove = useRemoveMember(ws.id);
  const [confirm, setConfirm] = useState<{ member: MemberDto; transfer?: boolean } | null>(null);

  const isMe = (m: MemberDto) => m.userId === user?.id;
  const canEdit = (m: MemberDto) => manage && !isMe(m) && ROLE_RANK[m.role] < ROLE_RANK[ws.role];

  async function confirmAction() {
    if (!confirm) return;
    const { member, transfer } = confirm;
    if (transfer) {
      await update.mutateAsync({ userId: member.userId, role: 'owner' });
    } else {
      await remove.mutateAsync(member.userId);
      if (isMe(member)) {
        await refreshProfile();
        navigate('/', { replace: true });
      }
    }
    setConfirm(null);
  }

  const me = members.data?.find(isMe);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ws.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            You're {ROLE_LABELS[ws.role].toLowerCase()} · {ws.baseCurrency}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/welcome')}>
          <Plus className="size-4" />
          Create or join another
        </Button>
      </div>

      {manage && (
        <Card className="space-y-1">
          <h2 className="font-semibold">Requests to join</h2>
          {requests.isLoading ? (
            <Spinner className="size-5" />
          ) : requests.data?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Requests to join">
              {requests.data.map((r) => (
                <JoinRequestRow key={r.id} request={r} roles={grantableRoles(ws.role)} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No pending requests.</p>
          )}
        </Card>
      )}

      <Card className="space-y-1">
        <h2 className="font-semibold">Members</h2>
        <ErrorMessage error={members.error ?? update.error ?? remove.error} />
        {members.isLoading ? (
          <Spinner className="size-5" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Members">
            {members.data?.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.displayName ?? m.email}
                    {isMe(m) && <span className="font-normal text-slate-500"> (you)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
                {canEdit(m) ? (
                  <Select
                    className="w-auto"
                    aria-label={`Role for ${m.displayName ?? m.email}`}
                    value={m.role}
                    disabled={update.isPending}
                    onChange={(e) => {
                      const role = e.target.value as WorkspaceRole;
                      if (role === 'owner') setConfirm({ member: m, transfer: true });
                      else update.mutate({ userId: m.userId, role });
                    }}
                  >
                    {[...new Set([m.role, ...grantableRoles(ws.role)])].map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                    {ws.role === 'owner' && <option value="owner">Owner (transfer)</option>}
                  </Select>
                ) : (
                  <span className="text-sm text-slate-600 dark:text-slate-300" title={ROLE_HELP[m.role]}>
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
                {canEdit(m) && (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`Remove ${m.displayName ?? m.email}`}
                    onClick={() => setConfirm({ member: m })}
                  >
                    <UserMinus className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-3 grid gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-2 dark:border-slate-800">
          {(Object.keys(ROLE_HELP) as WorkspaceRole[]).map((r) => (
            <div key={r}>
              <dt className="inline font-medium text-slate-600 dark:text-slate-300">{ROLE_LABELS[r]}:</dt>{' '}
              <dd className="inline">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {me && ws.role !== 'owner' && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Leaving removes your access. What you've added stays in the household.
          </p>
          <Button variant="secondary" onClick={() => setConfirm({ member: me })}>
            <LogOut className="size-4" />
            Leave household
          </Button>
        </Card>
      )}

      <Modal
        open={confirm !== null}
        title={
          confirm?.transfer
            ? 'Transfer ownership?'
            : confirm && isMe(confirm.member)
              ? `Leave ${ws.name}?`
              : 'Remove member?'
        }
        onClose={() => setConfirm(null)}
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {confirm.transfer
                ? `${confirm.member.displayName ?? confirm.member.email} becomes the owner and you become an admin.`
                : isMe(confirm.member)
                  ? 'You will lose access until an admin lets you back in.'
                  : `${confirm.member.displayName ?? confirm.member.email} will lose access to ${ws.name}.`}
            </p>
            <ErrorMessage error={update.error ?? remove.error} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm.transfer ? 'primary' : 'danger'}
                loading={update.isPending || remove.isPending}
                onClick={() => void confirmAction().catch(() => undefined)}
              >
                {confirm.transfer ? 'Transfer' : isMe(confirm.member) ? 'Leave' : 'Remove'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
