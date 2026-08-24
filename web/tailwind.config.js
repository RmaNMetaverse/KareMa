/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        surface2: 'hsl(var(--surface-2) / <alpha-value>)',
        surface3: 'hsl(var(--surface-3) / <alpha-value>)',
        line: 'hsl(var(--border) / <alpha-value>)',
        ink: 'hsl(var(--text) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-ink': 'hsl(var(--primary-ink) / <alpha-value>)',
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        'secondary-ink': 'hsl(var(--secondary-ink) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
      },
      borderRadius: {
        xs: 'calc(var(--radius) * 0.4)',
        sm: 'calc(var(--radius) * 0.6)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'calc(var(--radius) * 1.35)',
        xl: 'calc(var(--radius) * 1.8)',
        '2xl': 'calc(var(--radius) * 2.4)',
        '3xl': 'calc(var(--radius) * 3.2)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px hsl(var(--shadow) / 0.06), 0 4px 16px -4px hsl(var(--shadow) / 0.10)',
        lift: '0 2px 4px hsl(var(--shadow) / 0.08), 0 12px 32px -8px hsl(var(--shadow) / 0.18)',
        pop: '0 8px 16px hsl(var(--shadow) / 0.12), 0 24px 64px -12px hsl(var(--shadow) / 0.28)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.35), 0 8px 32px -8px hsl(var(--primary) / 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(.96) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(.9)', opacity: '0.7' },
          '80%,100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out both',
        'scale-in': 'scale-in .18s cubic-bezier(.22,1,.36,1) both',
        'slide-up': 'slide-up .22s cubic-bezier(.22,1,.36,1) both',
        'slide-in-right': 'slide-in-right .22s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(.24,.6,.35,1) infinite',
        float: 'float 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
