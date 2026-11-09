import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { GoogleLogin } from '@react-oauth/google';
import clsx from 'clsx';
import { BarChart3, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from '../components/AppLayout';
import { Button, ErrorMessage, Field, Input } from '../components/ui';

const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

export function LoginPage() {
  const { status, login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ identifier: '', email: '', username: '', password: '' });

  if (status === 'signedIn') return <Navigate to="/" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      mode === 'login'
        ? login({ identifier: form.identifier, password: form.password })
        : register({ email: form.email, username: form.username, password: form.password }),
    );
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="[&_span:last-child]:text-white">
          <Brand />
        </div>
        <div className="space-y-8">
          <h1 className="text-4xl leading-tight font-bold">Know where your money goes.</h1>
          <ul className="space-y-4 text-brand-100">
            <Feature icon={BarChart3} text="Beautiful dashboards of your spending" />
            <Feature icon={Users} text="Share finances with family (coming soon)" />
            <Feature icon={ShieldCheck} text="Your data, secured and private" />
          </ul>
        </div>
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full bg-white/5" />
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'login' ? 'Sign in to track your expenses.' : 'Start tracking in under a minute.'}
            </p>
          </div>

          {googleEnabled && (
            <>
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={(res) => res.credential && void run(() => loginWithGoogle(res.credential!))}
                  onError={() => setError(new Error('Google sign-in failed'))}
                  width="368"
                  text={mode === 'login' ? 'signin_with' : 'signup_with'}
                  shape="rectangular"
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                or
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'login' ? (
              <Field label="Email or username">
                <Input autoComplete="username" required value={form.identifier} onChange={set('identifier')} />
              </Field>
            ) : (
              <>
                <Field label="Email">
                  <Input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
                </Field>
                <Field label="Username" hint="3–32 characters: letters, numbers, _ . -">
                  <Input
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[a-zA-Z0-9_.\-]+"
                    value={form.username}
                    onChange={set('username')}
                  />
                </Field>
              </>
            )}
            <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
              <Input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
                value={form.password}
                onChange={set('password')}
              />
            </Field>

            <ErrorMessage error={error} />

            <Button type="submit" className="w-full" loading={busy}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              className={clsx('font-medium text-brand-600 hover:underline')}
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof BarChart3; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
        <Icon className="size-5" />
      </span>
      {text}
    </li>
  );
}
