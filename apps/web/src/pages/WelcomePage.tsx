import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import clsx from 'clsx';
import { Home, Search, Users } from 'lucide-react';
import { ROLE_LABELS, type JoinRequestDto, type WorkspaceSearchResultDto } from '@myfinances/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button, Card, ErrorMessage, Field, Input, Spinner } from '../components/ui';
import {
  useCancelJoinRequest,
  useCreateWorkspace,
  useMyJoinRequests,
  useRequestToJoin,
  useWorkspaceSearch,
} from '../hooks/households';

type Mode = 'create' | 'join';

/** Shown after sign-up (and from the workspace switcher): create a household or ask to join one. */
export function WelcomePage() {
  const { user, workspaces } = useAuth();
  const { data: requests = [] } = useMyJoinRequests();
  const [mode, setMode] = useState<Mode>('create');
  const first = workspaces.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {first ? `Welcome${user?.displayName ? `, ${user.displayName}` : ''}` : 'Add a household'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {first
            ? 'Set up a household to start tracking, or join one that already exists.'
            : 'Create another household or ask to join one.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Get started">
        <ModeCard
          active={mode === 'create'}
          onClick={() => setMode('create')}
          icon={Home}
          title="Create a household"
          text="Start fresh. You'll be its owner and can invite others."
        />
        <ModeCard
          active={mode === 'join'}
          onClick={() => setMode('join')}
          icon={Users}
          title="Join one"
          text="Find your family's household and ask its admins to let you in."
        />
      </div>

      {mode === 'create' ? <CreateHousehold /> : <JoinHousehold />}
      {requests.length > 0 && <MyRequests requests={requests} />}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  text,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Home;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'flex items-start gap-3 rounded-2xl bg-white p-4 text-left ring-1 transition dark:bg-slate-900',
        active
          ? 'ring-2 ring-brand-500'
          : 'ring-slate-200 hover:ring-slate-300 dark:ring-slate-800 dark:hover:ring-slate-700',
      )}
    >
      <span
        className={clsx(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
        )}
      >
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{text}</span>
      </span>
    </button>
  );
}

function CreateHousehold() {
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');

  async function submit(e: FormEvent) {
    e.preventDefault();
    await create.mutateAsync({ name, baseCurrency: currency });
    navigate('/', { replace: true });
  }

  return (
    <Card>
      <form onSubmit={(e) => void submit(e).catch(() => undefined)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Household name">
            <Input
              required
              maxLength={80}
              placeholder="e.g. The Sharma Family"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <Input
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
              title="A 3-letter currency code, e.g. INR"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <ErrorMessage error={create.error} />
        <Button type="submit" loading={create.isPending}>
          Create household
        </Button>
      </form>
    </Card>
  );
}

function JoinHousehold() {
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');
  const search = useWorkspaceSearch(q);
  const ask = useRequestToJoin();
  const tooShort = q.trim().length < 2;

  return (
    <Card className="space-y-4">
      <Field label="Search households">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            className="pl-9"
            placeholder="Household name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Field>
      <Field label="Message to the admins (optional)" hint="Helps them recognise you, e.g. “It's Priya, Ravi's sister”.">
        <Input maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <ErrorMessage error={ask.error} />

      {tooShort ? (
        <p className="text-sm text-slate-500">Type at least 2 characters to search.</p>
      ) : search.isLoading ? (
        <Spinner className="size-5" />
      ) : search.error ? (
        <ErrorMessage error={search.error} />
      ) : search.data?.length ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Search results">
          {search.data.map((w) => (
            <SearchResult
              key={w.id}
              workspace={w}
              busy={ask.isPending && ask.variables?.workspaceId === w.id}
              onAsk={() => ask.mutate({ workspaceId: w.id, message })}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No households match “{q.trim()}”.</p>
      )}
    </Card>
  );
}

export function adminNames(w: WorkspaceSearchResultDto): string {
  if (!w.admins.length) return 'No admin';
  return w.admins.map((a) => `${a.displayName ?? 'Unnamed'}${a.role === 'owner' ? ' (owner)' : ''}`).join(', ');
}

function SearchResult({
  workspace: w,
  busy,
  onAsk,
}: {
  workspace: WorkspaceSearchResultDto;
  busy: boolean;
  onAsk: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{w.name}</p>
        <p className="truncate text-sm text-slate-500">
          Admin: {adminNames(w)} · {w.memberCount} {w.memberCount === 1 ? 'member' : 'members'}
        </p>
      </div>
      {w.myRole ? (
        <span className="text-sm text-slate-500">You're {ROLE_LABELS[w.myRole].toLowerCase()}</span>
      ) : w.myRequestStatus === 'pending' ? (
        <span className="text-sm font-medium text-amber-600">Requested</span>
      ) : (
        <Button variant="secondary" loading={busy} onClick={onAsk} aria-label={`Ask to join ${w.name}`}>
          Ask to join
        </Button>
      )}
    </li>
  );
}

const statusStyles: Record<JoinRequestDto['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function MyRequests({ requests }: { requests: JoinRequestDto[] }) {
  const navigate = useNavigate();
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
    <Card className="space-y-3">
      <h2 className="font-semibold">Your requests</h2>
      <ErrorMessage error={cancel.error} />
      <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Your requests">
        {requests.map((r) => {
          const member = workspaces.some((w) => w.id === r.workspace.id);
          return (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.workspace.name}</p>
                <p className="text-xs text-slate-500">
                  {r.status === 'pending'
                    ? 'Waiting for an admin to approve'
                    : r.status === 'approved' && r.grantedRole
                      ? `Joined as ${ROLE_LABELS[r.grantedRole].toLowerCase()}`
                      : `Asked ${new Date(r.createdAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium capitalize', statusStyles[r.status])}>
                {r.status}
              </span>
              {r.status === 'pending' && (
                <Button
                  variant="ghost"
                  loading={cancel.isPending && cancel.variables === r.id}
                  onClick={() => cancel.mutate(r.id)}
                >
                  Cancel
                </Button>
              )}
              {r.status === 'approved' && member && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    selectWorkspace(r.workspace.id);
                    navigate('/');
                  }}
                >
                  Open
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
