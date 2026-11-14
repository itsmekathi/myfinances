import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Button, Card, ErrorMessage, Field, Input, Modal } from '../components/ui';

const providerLabel: Record<string, string> = { password: 'Email and password', google: 'Google' };

export function AccountPage() {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!user) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirmEmail('');
    setPassword('');
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await deleteAccount({ confirmEmail, password: user!.hasPassword ? password : undefined });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const emailMatches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>

      <Card className="space-y-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium">{user.displayName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium break-all">{user.email}</dd>
          </div>
          {user.username && (
            <div>
              <dt className="text-slate-500">Username</dt>
              <dd className="font-medium">{user.username}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">Sign-in methods</dt>
            <dd className="font-medium">{user.providers.map((p) => providerLabel[p] ?? p).join(', ')}</dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-3 ring-rose-200 dark:ring-rose-900/60">
        <h2 className="font-semibold text-rose-700 dark:text-rose-300">Delete account</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Permanently deletes your account, your workspace, and all its expenses, categories and attachments. This can't
          be undone. See our{' '}
          <Link to="/privacy" className="text-brand-600 hover:underline">
            privacy policy
          </Link>
          .
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" />
          Delete my account
        </Button>
      </Card>

      <Modal open={open} title="Delete your account?" onClose={close}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Everything in your workspace will be deleted immediately and permanently.
          </p>
          <Field label={`Type your email (${user.email}) to confirm`}>
            <Input
              type="email"
              autoComplete="off"
              required
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
          </Field>
          {user.hasPassword && (
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <ErrorMessage error={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!emailMatches}>
              Delete permanently
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
