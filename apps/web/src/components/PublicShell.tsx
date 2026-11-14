import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Brand } from './AppLayout';

export const CONTACT_EMAIL = 'itsmekathi92@gmail.com';
export const OPERATOR_NAME = 'Kathiravan B';

/** Header and footer for pages anyone can open without signing in (home, privacy). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="MyFinances home">
            <Brand />
          </Link>
          <Link
            to="/login"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {OPERATOR_NAME}</span>
          <nav className="flex gap-4">
            <Link to="/privacy" className="hover:underline">
              Privacy policy
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
