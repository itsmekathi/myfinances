import { Link, NavLink, Outlet } from 'react-router';
import clsx from 'clsx';
import { CircleUserRound, LayoutDashboard, LogOut, ReceiptText, Tags, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText, end: false },
  { to: '/categories', label: 'Categories', icon: Tags, end: false },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex dark:border-slate-800 dark:bg-slate-900">
        <Brand />
        <nav className="mt-8 flex-1 space-y-1">
          {nav.map((item) => (
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
              <item.icon className="size-4.5" />
              {item.label}
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
        <Brand />
        <div className="flex items-center">
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
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 py-2.5 text-xs font-medium',
                isActive ? 'text-brand-600' : 'text-slate-500',
              )
            }
          >
            <item.icon className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
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
