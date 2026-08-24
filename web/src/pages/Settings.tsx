import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera,
  Check,
  Contrast,
  Droplets,
  Eye,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Upload,
  UserCircle,
} from 'lucide-react';
import { del, patch, post, uploadAvatar } from '../lib/api';
import { useApp } from '../store/app';
import { DEFAULT_PREFS, Density, PRESET_PRIMARIES, THEME_PRESETS, ThemeMode } from '../lib/theme';
import { cn } from '../lib/utils';
import { Avatar, Field, Slider, Spinner, Switch } from '../components/ui';

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'profile', label: 'Profile', icon: <UserCircle size={16} /> },
  { id: 'security', label: 'Security', icon: <KeyRound size={16} /> },
];

const MODES: { id: ThemeMode; label: string; icon: React.ReactNode; blurb: string }[] = [
  { id: 'light', label: 'Light', icon: <Sun size={17} />, blurb: 'Bright surfaces' },
  { id: 'dark', label: 'Dark', icon: <Moon size={17} />, blurb: 'Balanced dark' },
  { id: 'warm', label: 'Eye comfort', icon: <Eye size={17} />, blurb: 'Warm, low blue light' },
  { id: 'midnight', label: 'Midnight', icon: <Contrast size={17} />, blurb: 'True black, OLED' },
  { id: 'system', label: 'System', icon: <Monitor size={17} />, blurb: 'Follow the OS' },
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'roomy', label: 'Roomy' },
];

export function SettingsPage() {
  const { tab = 'appearance' } = useParams();
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Tune how KareMa looks and manage your account.
      </p>

      <div className="mt-6 flex gap-1 border-b border-line/70">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/settings/${t.id}`)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === 'appearance' && <Appearance />}
        {tab === 'profile' && <Profile />}
        {tab === 'security' && <Security />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- appearance */

function Appearance() {
  const { prefs, setPrefs, resetPrefs, toast } = useApp();

  const applyPreset = (preset: (typeof THEME_PRESETS)[number]) => {
    setPrefs(preset.prefs);
    toast({ title: `${preset.name} applied`, tone: 'success' });
  };

  return (
    <div className="space-y-8">
      {/* live preview */}
      <Section title="Preview" description="Everything below updates instantly.">
        <div className="glass glass-sheen rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary">Primary action</button>
            <button className="btn btn-subtle">Secondary</button>
            <button className="btn btn-ghost">Ghost</button>
            <span className="chip bg-primary/16 text-primary">Label</span>
            <span className="chip bg-success/16 text-success">Done</span>
            <span className="chip bg-danger/16 text-danger">Overdue</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {['Design the level', 'Fix the camera drift', 'Ship the build'].map((t, i) => (
              <div key={t} className="glass rounded-lg p-2.5">
                <span
                  className="mb-1.5 block h-1.5 w-10 rounded-full"
                  style={{ background: [`hsl(var(--primary))`, `hsl(var(--secondary))`, '#22c55e'][i] }}
                />
                <p className="text-[13px] font-medium">{t}</p>
                <p className="mt-1 text-[11px] text-muted">Sample card</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Theme presets" description="A quick starting point you can then tweak.">
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="glass glass-hover overflow-hidden rounded-lg text-left"
            >
              <div
                className="h-12"
                style={{
                  background: `linear-gradient(120deg, ${preset.prefs.primary}, ${preset.prefs.secondary})`,
                }}
              />
              <div className="p-2.5">
                <p className="text-[13px] font-semibold">{preset.name}</p>
                <p className="text-[11px] text-muted">{preset.blurb}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Colour mode">
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setPrefs({ mode: m.id })}
              className={cn(
                // outline, not ring: the .glass box-shadow would paint over a ring
                'glass flex flex-col items-start gap-1.5 rounded-lg p-3 text-left outline-offset-[-2px] transition-all',
                prefs.mode === m.id
                  ? 'outline outline-2 outline-primary'
                  : 'hover:outline hover:outline-1 hover:outline-line'
              )}
            >
              <span className={cn(prefs.mode === m.id ? 'text-primary' : 'text-muted')}>
                {m.icon}
              </span>
              <span className="text-[13px] font-semibold">{m.label}</span>
              <span className="text-[11px] leading-snug text-muted">{m.blurb}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Brand colours"
        description="The primary drives buttons and highlights; the secondary is used in gradients."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <ColorControl
            label="Primary"
            value={prefs.primary}
            onChange={(primary) => setPrefs({ primary })}
          />
          <ColorControl
            label="Secondary"
            value={prefs.secondary}
            onChange={(secondary) => setPrefs({ secondary })}
          />
        </div>
      </Section>

      <Section
        title="Liquid glass"
        description="Frosted, translucent panels that pick up the colours behind them."
      >
        <div className="glass rounded-xl p-4">
          <Switch
            checked={prefs.glass}
            onChange={(glass) => setPrefs({ glass })}
            label="Enable liquid glass"
            description="Turn off for flat, fully opaque surfaces (a little faster on old hardware)"
          />
          {prefs.glass && (
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <Slider
                label="Blur"
                min={2}
                max={40}
                value={prefs.glassBlur}
                display={`${prefs.glassBlur}px`}
                onChange={(glassBlur) => setPrefs({ glassBlur })}
              />
              <Slider
                label="Opacity"
                min={0.2}
                max={0.95}
                step={0.01}
                value={prefs.glassAlpha}
                display={`${Math.round(prefs.glassAlpha * 100)}%`}
                onChange={(glassAlpha) => setPrefs({ glassAlpha })}
              />
              <Slider
                label="Sheen"
                min={0}
                max={0.8}
                step={0.01}
                value={prefs.glassSheen}
                display={`${Math.round(prefs.glassSheen * 100)}%`}
                onChange={(glassSheen) => setPrefs({ glassSheen })}
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Shape, size and motion">
        <div className="glass space-y-5 rounded-xl p-4">
          <Slider
            label="Corner radius"
            min={0}
            max={26}
            value={prefs.radius}
            display={`${prefs.radius}px`}
            onChange={(radius) => setPrefs({ radius })}
          />

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Density</p>
            <div className="flex gap-1.5">
              {DENSITIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setPrefs({ density: d.id })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                    prefs.density === d.id
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-line text-muted hover:text-ink'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <Slider
            label="Text size"
            min={0.88}
            max={1.16}
            step={0.02}
            value={prefs.fontScale}
            display={`${Math.round(prefs.fontScale * 100)}%`}
            onChange={(fontScale) => setPrefs({ fontScale })}
          />

          <Slider
            label="Ambient background"
            min={0}
            max={1}
            step={0.05}
            value={prefs.aurora}
            display={prefs.aurora === 0 ? 'Off' : `${Math.round(prefs.aurora * 100)}%`}
            onChange={(aurora) => setPrefs({ aurora })}
          />

          <Switch
            checked={prefs.motion}
            onChange={(motion) => setPrefs({ motion })}
            label="Animations"
            description="Turn off to reduce movement across the interface"
          />
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          className="btn btn-subtle"
          onClick={() => {
            resetPrefs();
            toast({ title: 'Appearance reset to defaults', tone: 'info' });
          }}
        >
          <RotateCcw size={15} />
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-lg shadow-soft"
          style={{ background: value }}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="font-mono text-[11px] uppercase text-muted">{value}</p>
        </div>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ml-auto h-9 w-9 cursor-pointer rounded-md border border-line bg-transparent"
          aria-label={`Pick a custom ${label.toLowerCase()} colour`}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESET_PRIMARIES.map((c) => (
          <button
            key={c.value}
            title={c.name}
            onClick={() => onChange(c.value)}
            style={{ background: c.value }}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-full transition-transform hover:scale-110',
              value.toLowerCase() === c.value.toLowerCase() && 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
            )}
          >
            {value.toLowerCase() === c.value.toLowerCase() && (
              <Check size={12} className="text-white" strokeWidth={3} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- profile */

function Profile() {
  const { user, refreshUser, toast } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [color, setColor] = useState(user?.avatarColor ?? '#6366f1');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setTitle(user?.title ?? '');
    setColor(user?.avatarColor ?? '#6366f1');
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      await patch('/api/auth/me', { name: name.trim(), title: title.trim() || null, avatarColor: color });
      await refreshUser();
      toast({ title: 'Profile saved', tone: 'success' });
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const pickPicture = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Pick an image file', tone: 'error' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'That image is larger than 8 MB', tone: 'error' });
      return;
    }
    setUploading(true);
    try {
      await uploadAvatar(file);
      await refreshUser();
      toast({ title: 'Profile picture updated', tone: 'success' });
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const removePicture = async () => {
    setUploading(true);
    try {
      await del('/api/auth/avatar');
      await refreshUser();
      toast({ title: 'Profile picture removed', tone: 'info' });
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="glass max-w-lg space-y-5 rounded-xl p-5">
      {/* ---- picture ---- */}
      <div
        className={cn(
          'flex items-center gap-4 rounded-lg border-2 border-dashed p-3 transition-colors',
          dragging ? 'border-primary bg-primary/8' : 'border-transparent'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickPicture(e.dataTransfer.files?.[0]);
        }}
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative shrink-0 rounded-full"
          aria-label="Change profile picture"
        >
          <Avatar
            user={{ name: name || '?', avatarColor: color, avatarUrl: user?.avatarUrl }}
            size={72}
          />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? <Spinner size={18} /> : <Camera size={20} />}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name || 'Your name'}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn btn-subtle py-1 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={13} />
              {user?.avatarUrl ? 'Replace picture' : 'Upload picture'}
            </button>
            {user?.avatarUrl && (
              <button
                type="button"
                className="btn btn-ghost py-1 text-xs"
                onClick={removePicture}
                disabled={uploading}
              >
                <Trash2 size={13} />
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            PNG, JPG, GIF or WebP up to 8 MB. Drag one here if you prefer.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pickPicture(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <Field label="Display name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Job title" hint="Shown on your profile, optional">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Technical Artist"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">
          Fallback colour
          <span className="ml-1.5 font-normal">used when you have no picture</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_PRIMARIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              style={{ background: c.value }}
              className={cn(
                'h-8 w-8 rounded-full transition-transform hover:scale-110',
                color === c.value && 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
              )}
            />
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
        {saving ? <Spinner size={15} /> : null}
        Save profile
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- security */

function Security() {
  const { toast } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: 'The new passwords do not match', tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      await post('/api/auth/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast({ title: 'Password changed', tone: 'success' });
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass max-w-md space-y-4 rounded-xl p-5">
      <div>
        <h2 className="text-sm font-semibold">Change your password</h2>
        <p className="mt-1 text-xs text-muted">At least 6 characters.</p>
      </div>
      <Field label="Current password">
        <input
          type="password"
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="New password">
        <input
          type="password"
          className="input"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </Field>
      <Field label="Confirm new password">
        <input
          type="password"
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      </Field>
      <button className="btn btn-primary" disabled={saving}>
        {saving ? <Spinner size={15} /> : null}
        Update password
      </button>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={14} className="text-primary" />
        {title}
      </h2>
      {description && <p className="mb-3 mt-1 text-xs text-muted">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}
