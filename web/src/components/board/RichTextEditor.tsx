import { useRef, useState } from 'react';
import {
  Bold,
  Code,
  Code2,
  Eye,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Pencil,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { cn, renderRichText } from '../../lib/utils';
import { MentionInput, MentionUser } from './MentionInput';

/**
 * A formatting toolbar over the mention-aware textarea.
 *
 * The stored value stays markdown-ish text rather than HTML, which keeps
 * `@[Name](id)` mentions intact for the server and means anything typed by hand
 * renders the same as anything inserted by a button. The Preview tab shows
 * exactly what the card or comment will look like.
 */

type Wrap = { kind: 'wrap'; before: string; after: string; placeholder: string };
type Prefix = { kind: 'prefix'; prefix: string | ((i: number) => string); placeholder: string };
type Block = { kind: 'block'; before: string; after: string; placeholder: string };
type Action = Wrap | Prefix | Block;

const TOOLS: {
  key: string;
  icon: React.ReactNode;
  title: string;
  shortcut?: string;
  action: Action;
  group: number;
}[] = [
  {
    key: 'bold',
    icon: <Bold size={14} />,
    title: 'Bold',
    shortcut: 'b',
    group: 0,
    action: { kind: 'wrap', before: '**', after: '**', placeholder: 'bold text' },
  },
  {
    key: 'italic',
    icon: <Italic size={14} />,
    title: 'Italic',
    shortcut: 'i',
    group: 0,
    action: { kind: 'wrap', before: '*', after: '*', placeholder: 'italic text' },
  },
  {
    key: 'strike',
    icon: <Strikethrough size={14} />,
    title: 'Strikethrough',
    group: 0,
    action: { kind: 'wrap', before: '~~', after: '~~', placeholder: 'struck through' },
  },
  {
    key: 'code',
    icon: <Code size={14} />,
    title: 'Inline code',
    shortcut: 'e',
    group: 0,
    action: { kind: 'wrap', before: '`', after: '`', placeholder: 'code' },
  },
  {
    key: 'h1',
    icon: <Heading1 size={14} />,
    title: 'Heading',
    group: 1,
    action: { kind: 'prefix', prefix: '## ', placeholder: 'Heading' },
  },
  {
    key: 'h2',
    icon: <Heading2 size={14} />,
    title: 'Subheading',
    group: 1,
    action: { kind: 'prefix', prefix: '### ', placeholder: 'Subheading' },
  },
  {
    key: 'ul',
    icon: <List size={14} />,
    title: 'Bulleted list',
    group: 2,
    action: { kind: 'prefix', prefix: '- ', placeholder: 'List item' },
  },
  {
    key: 'ol',
    icon: <ListOrdered size={14} />,
    title: 'Numbered list',
    group: 2,
    action: { kind: 'prefix', prefix: (i: number) => `${i + 1}. `, placeholder: 'List item' },
  },
  {
    key: 'task',
    icon: <ListTodo size={14} />,
    title: 'Task list',
    group: 2,
    action: { kind: 'prefix', prefix: '- [ ] ', placeholder: 'Something to do' },
  },
  {
    key: 'quote',
    icon: <Quote size={14} />,
    title: 'Quote',
    group: 3,
    action: { kind: 'prefix', prefix: '> ', placeholder: 'Quoted text' },
  },
  {
    key: 'pre',
    icon: <Code2 size={14} />,
    title: 'Code block',
    group: 3,
    action: { kind: 'block', before: '```\n', after: '\n```', placeholder: 'code' },
  },
  {
    key: 'link',
    icon: <Link2 size={14} />,
    title: 'Link',
    shortcut: 'k',
    group: 3,
    action: { kind: 'wrap', before: '[', after: '](https://)', placeholder: 'link text' },
  },
];

export function RichTextEditor({
  value,
  onChange,
  people,
  placeholder,
  rows = 5,
  onSubmit,
  autoFocus,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  people: MentionUser[];
  placeholder?: string;
  rows?: number;
  onSubmit?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);

  const apply = (action: Action) => {
    const el = inputRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    let next = value;
    let caretFrom = start;
    let caretTo = end;

    if (action.kind === 'wrap') {
      const body = selected || action.placeholder;
      const already =
        value.slice(start - action.before.length, start) === action.before &&
        value.slice(end, end + action.after.length) === action.after;

      if (already) {
        // toggle the markers back off
        next =
          value.slice(0, start - action.before.length) +
          body +
          value.slice(end + action.after.length);
        caretFrom = start - action.before.length;
        caretTo = caretFrom + body.length;
      } else {
        next = value.slice(0, start) + action.before + body + action.after + value.slice(end);
        caretFrom = start + action.before.length;
        caretTo = caretFrom + body.length;
      }
    } else if (action.kind === 'block') {
      const body = selected || action.placeholder;
      const lead = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
      next = value.slice(0, start) + lead + action.before + body + action.after + value.slice(end);
      caretFrom = start + lead.length + action.before.length;
      caretTo = caretFrom + body.length;
    } else {
      // prefix every selected line, or start a new prefixed line
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end);
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split('\n');
      const pre = (i: number) =>
        typeof action.prefix === 'function' ? action.prefix(i) : action.prefix;

      const allPrefixed = lines.every((l, i) => l.startsWith(pre(i)));
      const rebuilt = lines
        .map((l, i) => {
          if (allPrefixed) return l.slice(pre(i).length);
          return pre(i) + (l || (lines.length === 1 ? action.placeholder : ''));
        })
        .join('\n');

      next = value.slice(0, lineStart) + rebuilt + value.slice(lineEnd);
      caretFrom = lineStart;
      caretTo = lineStart + rebuilt.length;
    }

    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caretFrom, caretTo);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const tool = TOOLS.find((t) => t.shortcut && t.shortcut === e.key.toLowerCase());
    if (!tool) return;
    e.preventDefault();
    apply(tool.action);
  };

  const groups = Array.from(new Set(TOOLS.map((t) => t.group)));

  return (
    <div className="rounded-md border border-line bg-surface2/40 focus-within:border-primary/60">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line/70 px-1.5 py-1">
        {groups.map((g, gi) => (
          <span key={g} className="flex items-center gap-0.5">
            {gi > 0 && <span className="mx-1 h-4 w-px bg-line" />}
            {TOOLS.filter((t) => t.group === g)
              .filter((t) => !compact || ['bold', 'italic', 'code', 'ul', 'ol', 'link'].includes(t.key))
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  title={t.shortcut ? `${t.title}  (Ctrl+${t.shortcut.toUpperCase()})` : t.title}
                  aria-label={t.title}
                  disabled={preview}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply(t.action)}
                  className="grid h-7 w-7 place-items-center rounded-xs text-muted transition-colors hover:bg-surface3 hover:text-ink disabled:opacity-40"
                >
                  {t.icon}
                </button>
              ))}
          </span>
        ))}

        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-xs px-2 py-1 text-[11px] font-medium transition-colors',
            preview ? 'bg-primary/16 text-primary' : 'text-muted hover:bg-surface3 hover:text-ink'
          )}
        >
          {preview ? <Pencil size={12} /> : <Eye size={12} />}
          {preview ? 'Write' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div
          className="prose-mini min-h-[6rem] px-3 py-2.5 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: value.trim()
              ? renderRichText(value)
              : '<p class="opacity-60">Nothing to preview yet.</p>',
          }}
        />
      ) : (
        <MentionInput
          value={value}
          onChange={onChange}
          people={people}
          rows={rows}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onSubmit={onSubmit}
          inputRef={inputRef}
          onKeyDown={onKeyDown}
          className="rounded-none border-0 bg-transparent focus:shadow-none"
        />
      )}
    </div>
  );
}
