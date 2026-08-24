import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui';

export type MentionUser = {
  id: string;
  name: string;
  email?: string;
  avatarColor: string;
  avatarUrl?: string | null;
};

/**
 * Textarea with an @mention autocomplete. Mentions are stored as
 * `@[Display Name](userId)` so the server can resolve them reliably.
 */
export function MentionInput({
  value,
  onChange,
  people,
  placeholder,
  rows = 3,
  onSubmit,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  people: MentionUser[];
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(0);
  const [cursor, setCursor] = useState(0);

  const matches =
    query === null
      ? []
      : people
          .filter((p) =>
            `${p.name} ${p.email ?? ''}`.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 6);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  const detectMention = (text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const m = /(?:^|\s)@([\w.\- ]{0,30})$/.exec(upto);
    if (!m) {
      setQuery(null);
      return;
    }
    setQuery(m[1]);
    setAnchor(caret - m[1].length - 1);
  };

  const insert = (person: MentionUser) => {
    const before = value.slice(0, anchor);
    const after = value.slice(ref.current?.selectionStart ?? anchor);
    const token = `@[${person.name}](${person.id}) `;
    const next = `${before}${token}${after}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + token.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn('input resize-none', className)}
        onChange={(e) => {
          onChange(e.target.value);
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detectMention(value, (e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 140)}
        onKeyDown={(e) => {
          if (query !== null && matches.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => (c + 1) % matches.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => (c - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insert(matches[cursor]);
              return;
            }
            if (e.key === 'Escape') {
              setQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />

      {query !== null && matches.length > 0 && (
        <div className="glass glass-sheen absolute bottom-full left-0 z-40 mb-1.5 w-64 rounded-lg p-1 shadow-pop">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(p);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                i === cursor ? 'bg-primary/14' : 'hover:bg-surface3/60'
              )}
            >
              <Avatar user={p} size={22} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
