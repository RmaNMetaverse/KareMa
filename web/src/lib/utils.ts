export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function timeAgo(input: string | Date) {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const steps: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2592000, 'month'],
    [31536000, 'year'],
  ];
  let value = seconds;
  let unit = 'second';
  for (let i = 0; i < steps.length; i++) {
    const [limit, name] = steps[i];
    if (seconds < limit) break;
    value = Math.floor(seconds / limit);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

export function formatDate(input?: string | Date | null, withTime = false) {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export type DueState = 'none' | 'upcoming' | 'soon' | 'today' | 'overdue' | 'done';

export function dueState(dueDate?: string | null, isComplete?: boolean): DueState {
  if (!dueDate) return 'none';
  if (isComplete) return 'done';
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  const diff = due - now;
  if (diff < 0) return 'overdue';
  if (diff < 86400000) return 'today';
  if (diff < 3 * 86400000) return 'soon';
  return 'upcoming';
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Very small, safe markdown-ish renderer for descriptions and comments. */
export function renderRichText(input: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const blocks: string[] = [];
  const links: string[] = [];
  let text = esc(input);

  // fenced code first, stashed so nothing else touches it
  text = text.replace(/```([\s\S]*?)```/g, (_m, code) => {
    blocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\nKMCODE${blocks.length - 1}KMCODE\n`;
  });

  text = text
    .replace(/@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g, '<span class="mention">@$1</span>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    // [label](url) — stashed so the bare-url linker below cannot chew the href
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, href) => {
      links.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
      return `KMLINK${links.length - 1}KMLINK`;
    })
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

  const lines = text.split('\n');
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const quote = /^\s*&gt;\s?(.*)$/.exec(line);

    if (heading) {
      if (inList) {
        out.push(`</${inList}>`);
        inList = null;
      }
      // a single "#" already reads as a big heading inside a card, so start at h2
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${heading[2]}</h${level}>`);
      continue;
    }
    if (task) {
      if (inList !== 'ul') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ul class="task-list">');
        inList = 'ul';
      }
      const done = task[1].toLowerCase() === 'x';
      out.push(
        `<li class="task${done ? ' done' : ''}"><span class="box" aria-hidden="true">${
          done ? '&#10003;' : ''
        }</span>${task[2]}</li>`
      );
      continue;
    }
    if (bullet) {
      if (inList !== 'ul') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ul>');
        inList = 'ul';
      }
      out.push(`<li>${bullet[1]}</li>`);
      continue;
    }
    if (numbered) {
      if (inList !== 'ol') {
        if (inList) out.push(`</${inList}>`);
        out.push('<ol>');
        inList = 'ol';
      }
      out.push(`<li>${numbered[1]}</li>`);
      continue;
    }
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
    if (quote) {
      out.push(`<blockquote>${quote[1]}</blockquote>`);
      continue;
    }
    if (line.trim() === '') out.push('');
    else out.push(`<p>${line}</p>`);
  }
  if (inList) out.push(`</${inList}>`);

  return out
    .join('\n')
    .replace(/KMCODE(\d+)KMCODE/g, (_m, i) => blocks[Number(i)])
    .replace(/KMLINK(\d+)KMLINK/g, (_m, i) => links[Number(i)]);
}

/** Strip mention syntax down to plain "@Name" for previews. */
export function plainText(input: string) {
  return input.replace(/@\[([^\]]+)\]\([a-zA-Z0-9_-]+\)/g, '@$1');
}

export const CARD_COLORS = [
  { name: 'None', value: null },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Slate', value: '#64748b' },
];

export const GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#30cfd0,#330867)',
  'linear-gradient(135deg,#a8edea,#fed6e3)',
  'linear-gradient(135deg,#ff9a9e,#fecfef)',
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#5ee7df,#b490ca)',
  'linear-gradient(135deg,#c471f5,#fa71cd)',
  'linear-gradient(135deg,#0f2027,#2c5364)',
];

export const BOARD_ICONS = [
  '📋', '🚀', '🎨', '🐛', '📦', '💡', '🎯', '🔥', '⚡', '🧪',
  '🎮', '🎬', '🎵', '📊', '🛠️', '🌱', '🧩', '🏗️', '📝', '🗂️',
];

export const PRIORITIES = [
  { value: 'NONE', label: 'None', color: '#94a3b8' },
  { value: 'LOW', label: 'Low', color: '#0ea5e9' },
  { value: 'MEDIUM', label: 'Medium', color: '#f59e0b' },
  { value: 'HIGH', label: 'High', color: '#f97316' },
  { value: 'URGENT', label: 'Urgent', color: '#ef4444' },
] as const;
