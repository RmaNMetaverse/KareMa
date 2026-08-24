import { Link } from 'react-router-dom';
import { Contrast, Droplets, Eye, Monitor, Moon, Palette, SlidersHorizontal, Sun } from 'lucide-react';
import { useApp } from '../store/app';
import { PRESET_PRIMARIES, ThemeMode } from '../lib/theme';
import { cn } from '../lib/utils';
import { MenuItem, Popover, Switch } from './ui';

const MODES: { id: ThemeMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'light', label: 'Light', icon: <Sun size={15} />, hint: 'Bright' },
  { id: 'dark', label: 'Dark', icon: <Moon size={15} />, hint: 'Default' },
  { id: 'warm', label: 'Eye comfort', icon: <Eye size={15} />, hint: 'Warm' },
  { id: 'midnight', label: 'Midnight', icon: <Contrast size={15} />, hint: 'OLED' },
  { id: 'system', label: 'Match system', icon: <Monitor size={15} />, hint: 'Auto' },
];

export function ThemeMenu() {
  const { prefs, setPrefs } = useApp();

  return (
    <Popover
      align="right"
      width="w-72"
      trigger={({ toggle }) => (
        <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label="Appearance">
          <Palette size={18} />
        </button>
      )}
    >
      <div className="px-1 pb-1 pt-0.5">
        <p className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Appearance
        </p>
        {MODES.map((m) => (
          <MenuItem
            key={m.id}
            icon={m.icon}
            hint={m.hint}
            active={prefs.mode === m.id}
            onClick={() => setPrefs({ mode: m.id })}
          >
            {m.label}
          </MenuItem>
        ))}

        <div className="divider my-2" />

        <p className="px-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Accent
        </p>
        <div className="grid grid-cols-6 gap-1.5 px-1.5 pb-2">
          {PRESET_PRIMARIES.map((c) => (
            <button
              key={c.value}
              title={c.name}
              onClick={() => setPrefs({ primary: c.value })}
              style={{ background: c.value }}
              className={cn(
                'h-7 w-7 rounded-full transition-transform hover:scale-110',
                prefs.primary.toLowerCase() === c.value.toLowerCase() &&
                  'ring-2 ring-offset-2 ring-offset-surface ring-ink'
              )}
            />
          ))}
        </div>

        <div className="divider my-2" />

        <div className="px-1.5 py-1.5">
          <Switch
            checked={prefs.glass}
            onChange={(v) => setPrefs({ glass: v })}
            label="Liquid glass"
            description="Frosted, translucent surfaces"
          />
        </div>
        {prefs.glass && (
          <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
            <Droplets size={14} className="shrink-0 text-muted" />
            <input
              type="range"
              min={4}
              max={40}
              value={prefs.glassBlur}
              onChange={(e) => setPrefs({ glassBlur: Number(e.target.value) })}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(90deg, hsl(var(--primary)) ${
                  ((prefs.glassBlur - 4) / 36) * 100
                }%, hsl(var(--surface-3)) ${((prefs.glassBlur - 4) / 36) * 100}%)`,
              }}
            />
          </div>
        )}

        <div className="divider my-2" />
        <Link to="/settings/appearance">
          <MenuItem icon={<SlidersHorizontal size={15} />}>All appearance settings</MenuItem>
        </Link>
      </div>
    </Popover>
  );
}
