import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cn, initials } from '../lib/utils';

/* ----------------------------------------------------------------- Avatar */

export function Avatar({
  user,
  size = 28,
  ring = false,
  title,
}: {
  user?: { name: string; avatarColor?: string; avatarUrl?: string | null } | null;
  size?: number;
  ring?: boolean;
  title?: string;
}) {
  if (!user) return null;
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(9, size * 0.38),
    background: user.avatarUrl ? undefined : user.avatarColor || '#6366f1',
  };
  return (
    <span
      title={title ?? user.name}
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white overflow-hidden select-none',
        ring && 'ring-2 ring-surface'
      )}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
      ) : (
        initials(user.name)
      )}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = 26,
}: {
  users: { name: string; avatarColor?: string; avatarUrl?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u, i) => (
        <Avatar key={i} user={u} size={size} ring />
      ))}
      {rest > 0 && (
        <span
          style={{ width: size, height: size, fontSize: size * 0.36 }}
          className="inline-flex items-center justify-center rounded-full bg-surface3 text-ink font-semibold ring-2 ring-surface"
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  children,
  width = 'max-w-2xl',
  closeOnBackdrop = true,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  closeOnBackdrop?: boolean;
  label?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[3px]"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'glass glass-sheen glass-strong relative z-10 w-full rounded-2xl my-4 sm:my-8',
              width
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  icon,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  icon?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
      {icon && <div className="mt-0.5 text-primary">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right}
      {onClose && (
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Popover */

export function Popover({
  trigger,
  children,
  align = 'left',
  width = 'w-64',
  className,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: 'left' | 'right' | 'center';
  width?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'glass glass-sheen absolute z-50 mt-2 rounded-lg p-2 shadow-pop',
              width,
              align === 'right' && 'right-0',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              className
            )}
          >
            {typeof children === 'function' ? children(close) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
  hint,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm transition-colors',
        danger ? 'text-danger hover:bg-danger/12' : 'hover:bg-surface3/70',
        active && 'bg-surface3/60 font-medium'
      )}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11px] text-muted">{hint}</span>}
      {active && <Check size={14} className="shrink-0 text-primary" />}
    </button>
  );
}

/* -------------------------------------------------------------- Form bits */

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left"
    >
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-surface3'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </span>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && <span className="block text-sm font-medium">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  display,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label?: string;
  display?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-muted">{label}</span>
          <span className="font-mono text-[11px] text-muted">{display ?? value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none
          [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,.4)] [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
        style={{
          background: `linear-gradient(90deg, hsl(var(--primary)) ${pct}%, hsl(var(--surface-3)) ${pct}%)`,
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Feedback */

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size, opacity: 0.7 }}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-[11px] font-medium text-bg opacity-0 transition-opacity group-hover/tt:opacity-100">
        {label}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- Confirm */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  destructive = true,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} width="max-w-sm">
      <div className="p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-subtle" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={cn('btn', destructive ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
