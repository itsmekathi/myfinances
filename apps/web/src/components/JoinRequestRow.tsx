import { useState } from 'react';
import { ROLE_LABELS, type GrantableRole, type JoinRequestDto } from '@myfinances/shared';
import { Button, Select } from './ui';
import { useDecideJoinRequest } from '../hooks/households';

/** One pending request with a role picker and approve/reject. */
export function JoinRequestRow({
  request: r,
  roles,
  showWorkspace = false,
}: {
  request: JoinRequestDto;
  /** Roles the viewer may grant. */
  roles: GrantableRole[];
  showWorkspace?: boolean;
}) {
  const decide = useDecideJoinRequest();
  const [role, setRole] = useState<GrantableRole>('viewer');
  const who = r.user.displayName ?? r.user.email;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {who}
            {showWorkspace && <span className="font-normal text-slate-500"> → {r.workspace.name}</span>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {r.user.email} · asked {new Date(r.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Select
          className="w-auto"
          aria-label={`Role for ${who}`}
          value={role}
          onChange={(e) => setRole(e.target.value as GrantableRole)}
        >
          {roles.map((x) => (
            <option key={x} value={x}>
              {ROLE_LABELS[x]}
            </option>
          ))}
        </Select>
        <Button
          loading={decide.isPending && decide.variables?.approve}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: r.id, approve: true, role })}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          loading={decide.isPending && !decide.variables?.approve}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: r.id, approve: false })}
        >
          Reject
        </Button>
      </div>
      {r.message && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">“{r.message}”</p>}
      {decide.error && <p className="text-sm text-rose-600">{decide.error.message}</p>}
    </li>
  );
}
