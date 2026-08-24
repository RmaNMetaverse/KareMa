import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../store/app';
import { cn } from '../lib/utils';

const ICONS = {
  default: <Info size={16} />,
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
};

const TONES = {
  default: 'text-primary',
  info: 'text-primary',
  success: 'text-success',
  error: 'text-danger',
};

export function Toaster() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="glass glass-sheen pointer-events-auto flex items-start gap-3 rounded-lg p-3 shadow-pop"
          >
            <span className={cn('mt-0.5 shrink-0', TONES[t.tone])}>{ICONS[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
            </div>
            <button
              className="shrink-0 rounded-xs p-1 text-muted transition-colors hover:bg-surface3 hover:text-ink"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
