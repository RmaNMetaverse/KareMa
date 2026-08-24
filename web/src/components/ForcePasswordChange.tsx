import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { post } from '../lib/api';
import { useApp } from '../store/app';
import { Field, Modal, Spinner } from './ui';

/**
 * Shown when an administrator created or reset the account with a temporary
 * password. The user cannot reach the app until they pick their own.
 */
export function ForcePasswordChange() {
  const { user, refreshUser, logout, toast } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user?.mustChangePw) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('Your new password needs at least 6 characters');
    if (next !== confirm) return setError('The two new passwords do not match');
    if (next === current) return setError('Pick something different from the temporary password');

    setSaving(true);
    try {
      await post('/api/auth/password', { currentPassword: current, newPassword: next });
      await refreshUser();
      toast({ title: 'Password set. Welcome to KareMa.', tone: 'success' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={() => undefined} closeOnBackdrop={false} width="max-w-md" label="Set your password">
      <form onSubmit={submit} className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/14 text-primary">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 className="text-base font-bold">Choose your own password</h2>
            <p className="text-xs text-muted">
              Your account was set up with a temporary password.
            </p>
          </div>
        </div>

        <div className="space-y-3.5">
          <Field label="Temporary password">
            <input
              type="password"
              className="input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="New password" hint="At least 6 characters">
            <input
              type="password"
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-danger/12 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
            {saving ? <Spinner size={15} /> : <KeyRound size={15} />}
            Set password
          </button>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </form>
    </Modal>
  );
}
