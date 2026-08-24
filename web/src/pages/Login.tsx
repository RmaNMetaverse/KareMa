import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Contrast, Eye, Lock, Mail, Moon, Sun } from 'lucide-react';
import { useApp } from '../store/app';
import { ThemeMode } from '../lib/theme';
import { cn } from '../lib/utils';
import { Spinner } from '../components/ui';

const QUICK_MODES: { id: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { id: 'light', icon: <Sun size={15} />, label: 'Light' },
  { id: 'dark', icon: <Moon size={15} />, label: 'Dark' },
  { id: 'warm', icon: <Eye size={15} />, label: 'Eye comfort' },
  { id: 'midnight', icon: <Contrast size={15} />, label: 'Midnight' },
];

export function Login() {
  const { login, prefs, setPrefs } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="app-aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-2xl md:grid-cols-2">
        {/* brand panel */}
        <div className="relative hidden flex-col justify-between p-9 md:flex">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-secondary text-lg font-black text-primary-ink shadow-glow">
                K
              </span>
              <span className="text-xl font-bold tracking-tight">KareMa</span>
            </div>
            <h1 className="mt-10 text-3xl font-extrabold leading-tight tracking-tight">
              Plan the work.
              <br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Then watch it move.
              </span>
            </h1>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              A self-hosted board for your studio — cards, covers, attachments, comments and
              real-time updates, all on your own machine.
            </p>
          </div>

          <ul className="space-y-2.5 text-sm text-muted">
            {['Drag-and-drop kanban boards', 'Comments with @mentions', 'Live notifications', 'Your data never leaves the building'].map(
              (line) => (
                <li key={line} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {line}
                </li>
              )
            )}
          </ul>
        </div>

        {/* form panel */}
        <div className="glass glass-sheen rounded-2xl p-7 sm:p-9">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-primary to-secondary font-black text-primary-ink">
              K
            </span>
            <span className="text-lg font-bold">KareMa</span>
          </div>

          <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Sign in to reach your boards.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Email</span>
              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="email"
                  className="input input-lg pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@studio.local"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Password</span>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="password"
                  className="input input-lg pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>

            {error && (
              <p className="animate-slide-up rounded-md bg-danger/12 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
              {busy ? <Spinner size={16} /> : null}
              Sign in
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-7 border-t border-line/60 pt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Appearance
            </p>
            <div className="flex gap-1.5">
              {QUICK_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.label}
                  onClick={() => setPrefs({ mode: m.id })}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                    prefs.mode === m.id
                      ? 'border-primary/50 bg-primary/12 text-primary'
                      : 'border-line text-muted hover:text-ink'
                  )}
                >
                  {m.icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
