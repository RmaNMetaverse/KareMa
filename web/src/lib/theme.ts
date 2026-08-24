export type ThemeMode = 'light' | 'dark' | 'warm' | 'midnight' | 'system';
export type Density = 'compact' | 'cozy' | 'roomy';

export type Prefs = {
  mode: ThemeMode;
  primary: string;
  secondary: string;
  glass: boolean;
  glassBlur: number; // px
  glassAlpha: number; // 0..1, lower = more see-through
  glassSheen: number; // 0..1
  radius: number; // px
  density: Density;
  fontScale: number; // 0.9..1.15
  motion: boolean;
  aurora: number; // 0..1 ambient background strength
  sidebarCollapsed: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  mode: 'dark',
  primary: '#6366f1',
  secondary: '#a855f7',
  glass: true,
  glassBlur: 18,
  glassAlpha: 0.6,
  glassSheen: 0.35,
  radius: 14,
  density: 'cozy',
  fontScale: 1,
  motion: true,
  aurora: 0.5,
  sidebarCollapsed: false,
};

export const PRESET_PRIMARIES = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Slate', value: '#64748b' },
];

export const THEME_PRESETS: { id: string; name: string; blurb: string; prefs: Partial<Prefs> }[] = [
  {
    id: 'nebula',
    name: 'Nebula',
    blurb: 'Deep indigo glass',
    prefs: { mode: 'dark', primary: '#6366f1', secondary: '#a855f7', glass: true, aurora: 0.55 },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    blurb: 'Crisp and bright',
    prefs: { mode: 'light', primary: '#3b82f6', secondary: '#06b6d4', glass: true, aurora: 0.35 },
  },
  {
    id: 'amber-desk',
    name: 'Amber Desk',
    blurb: 'Warm, easy on the eyes',
    prefs: { mode: 'warm', primary: '#c2410c', secondary: '#b45309', glass: true, aurora: 0.3 },
  },
  {
    id: 'oled',
    name: 'Midnight',
    blurb: 'True black, low glare',
    prefs: { mode: 'midnight', primary: '#22d3ee', secondary: '#818cf8', glass: true, aurora: 0.35 },
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Calm green focus',
    prefs: { mode: 'dark', primary: '#10b981', secondary: '#14b8a6', glass: true, aurora: 0.45 },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    blurb: 'Bold and warm',
    prefs: { mode: 'dark', primary: '#f43f5e', secondary: '#f97316', glass: true, aurora: 0.6 },
  },
  {
    id: 'paper',
    name: 'Paper',
    blurb: 'Flat, no glass, high focus',
    prefs: { mode: 'light', primary: '#111827', secondary: '#4b5563', glass: false, aurora: 0 },
  },
];

/* ------------------------------------------------------------------ colour */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6) || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHslTriplet(hex: string): string {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Relative luminance, used to decide black or white text on a colour. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableInk(hex: string): string {
  return luminance(hex) > 0.45 ? '222 40% 10%' : '0 0% 100%';
}

/* ------------------------------------------------------------------- apply */

export function resolveMode(mode: ThemeMode): Exclude<ThemeMode, 'system'> {
  if (mode !== 'system') return mode;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

const DENSITY_SCALE: Record<Density, number> = { compact: 0.85, cozy: 1, roomy: 1.18 };

export function applyPrefs(prefs: Prefs) {
  const root = document.documentElement;
  const mode = resolveMode(prefs.mode);

  root.dataset.theme = mode;
  root.dataset.glass = prefs.glass ? 'on' : 'off';
  root.dataset.motion = prefs.motion ? 'on' : 'off';
  root.dataset.density = prefs.density;

  root.style.setProperty('--primary', hexToHslTriplet(prefs.primary));
  root.style.setProperty('--primary-ink', readableInk(prefs.primary));
  root.style.setProperty('--secondary', hexToHslTriplet(prefs.secondary));
  root.style.setProperty('--secondary-ink', readableInk(prefs.secondary));
  root.style.setProperty('--radius', `${prefs.radius}px`);
  root.style.setProperty('--density', String(DENSITY_SCALE[prefs.density] ?? 1));
  root.style.setProperty('--font-scale', String(prefs.fontScale));
  root.style.setProperty('--glass-blur', `${prefs.glassBlur}px`);
  root.style.setProperty('--glass-sheen', String(prefs.glassSheen));
  root.style.setProperty('--aurora-strength', String(prefs.aurora));

  // Glass alpha is theme-dependent: dark themes need a lower alpha to read well.
  const base = mode === 'light' || mode === 'warm' ? 0.1 : 0;
  root.style.setProperty('--glass-alpha', String(Math.min(0.95, prefs.glassAlpha + base)));

  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', `hsl(${bg})`);
}

const STORAGE_KEY = 'karema.prefs';

export function loadLocalPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveLocalPrefs(prefs: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable in private mode */
  }
}
