import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import clsx from 'clsx';
import {
  CircleUserRound,
  HandCoins,
  House,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
  Wallet,
} from 'lucide-react';
import { canManageMembers } from '@myfinances/shared';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspaceJoinRequests } from '../hooks/households';
import { KIND_STYLES } from '../lib/kinds';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText, end: false, iconClass: KIND_STYLES.expense.text },
  { to: '/income', label: 'Income', icon: HandCoins, end: false, iconClass: KIND_STYLES.income.text },
  { to: '/investments', label: 'Investments', mobileLabel: 'Invest', icon: PiggyBank, end: false, iconClass: KIND_STYLES.investment.text },
  { to: '/categories', label: 'Categories', icon: Tags, end: false },
] as NavItem[];

type NavItem = { to: string; label: string; mobileLabel?: string; icon: typeof Tags; end: boolean; iconClass?: string };

const NEW_WORKSPACE = '__new';

export function AppLayout() {
  const { user, logout, workspace } = useAuth();
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase();
  const manage = canManageMembers(workspace?.role);
  const { data: requests } = useWorkspaceJoinRequests(workspace?.id ?? '', Boolean(workspace) && manage);
  const pending = requests?.length ?? 0;
  const siteAdmin = user?.siteRole === 'admin';

  // Before the user has a workspace, the only place to go is "get started".
  const sideNav: NavItem[] = workspace
    ? [...nav, { to: '/household', label: 'Household', icon: Users, end: false }]
    : [{ to: '/welcome', label: 'Get started', icon: Sparkles, end: false }];
  if (siteAdmin) sideNav.push({ to: '/admin', label: 'Site admin', icon: ShieldCheck, end: false });

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex dark:border-slate-800 dark:bg-slate-900">
        <Brand />
        {workspace && <WorkspaceSwitcher className="mt-6" />}
        <nav className="mt-6 flex-1 space-y-1">
          {sideNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-100'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <item.icon className={clsx('size-4.5', item.iconClass)} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/household' && pending > 0 && (
                <span
                  className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
                  aria-label={`${pending} pending requests`}
                >
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Link
            to="/account"
            className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Account"
          >
            <Avatar url={user?.avatarUrl} initials={initials} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.displayName}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </Link>
          <button
            onClick={() => void logout()}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/80">
        {workspace ? <WorkspaceSwitcher compact /> : <Brand />}
        <div className="flex items-center">
          {workspace && (
            <Link to="/household" className="relative rounded-md p-2 text-slate-500" aria-label="Household">
              <Users className="size-5" />
              {pending > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500" />}
            </Link>
          )}
          {siteAdmin && (
            <Link to="/admin" className="rounded-md p-2 text-slate-500" aria-label="Site admin">
              <ShieldCheck className="size-5" />
            </Link>
          )}
          <Link to="/account" className="rounded-md p-2 text-slate-500" aria-label="Account">
            <CircleUserRound className="size-5" />
          </Link>
          <button onClick={() => void logout()} className="rounded-md p-2 text-slate-500" aria-label="Sign out">
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pt-6 pb-24 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav (mobile) */}
      {workspace && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex min-w-0 flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                  isActive ? 'text-brand-600' : 'text-slate-500',
                )
              }
            >
              <item.icon className={clsx('size-5', item.iconClass)} />
              <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Picks the active household; the last option goes to "create or join". */
function WorkspaceSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const { workspaces, workspace, selectWorkspace } = useAuth();
  const navigate = useNavigate();
  return (
    <label className={clsx('relative flex min-w-0 items-center gap-2', className)}>
      <House className="pointer-events-none absolute left-3 size-4 text-slate-400" />
      <span className="sr-only">Household</span>
      <select
        className={clsx(
          'w-full truncate rounded-lg border-0 bg-slate-50 py-2 pr-8 pl-9 text-sm font-medium ring-1 ring-slate-200',
          'focus:ring-2 focus:ring-brand-500 focus:outline-none dark:bg-slate-800 dark:ring-slate-700',
          compact && 'max-w-[55vw]',
        )}
        value={workspace?.id ?? ''}
        onChange={(e) => {
          if (e.target.value === NEW_WORKSPACE) navigate('/welcome');
          else {
            selectWorkspace(e.target.value);
            navigate('/');
          }
        }}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
        <option value={NEW_WORKSPACE}>+ Create or join…</option>
      </select>
    </label>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <Wallet className="size-5" />
      </span>
      <span className="text-lg font-bold tracking-tight">MyFinances</span>
    </div>
  );
}

function Avatar({ url, initials }: { url?: string | null; initials: string }) {
  if (url) return <img src={url} alt="" className="size-9 rounded-full" referrerPolicy="no-referrer" />;
  return (
    <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
      {initials}
    </span>
  );
}
