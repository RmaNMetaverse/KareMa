import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlignLeft,
  CheckSquare,
  Clock,
  CornerDownRight,
  GitBranch,
  MessageSquare,
  Paperclip,
} from 'lucide-react';
import { cn, dueState, formatDate, initials, PRIORITIES } from '../../lib/utils';
import { withBase } from '../../lib/base';

export type CardData = {
  id: string;
  title: string;
  description?: string | null;
  color?: string | null;
  coverType?: string | null;
  coverValue?: string | null;
  coverSize?: string;
  priority: string;
  dueDate?: string | null;
  startDate?: string | null;
  isComplete: boolean;
  number: number;
  assignees: { user: { id: string; name: string; avatarColor: string; avatarUrl?: string | null } }[];
  labels: { label: { id: string; name: string; color: string } }[];
  checklists: { items: { isDone: boolean }[] }[];
  attachments: { id: string }[];
  parentId?: string | null;
  parent?: { id: string; number: number; title: string } | null;
  children?: { id: string; isComplete: boolean }[];
  _count?: { comments: number; attachments: number; children?: number };
};

const DUE_STYLES: Record<string, string> = {
  overdue: 'bg-danger/16 text-danger',
  today: 'bg-warning/18 text-warning',
  soon: 'bg-warning/12 text-warning',
  upcoming: 'bg-surface3/70 text-muted',
  done: 'bg-success/16 text-success',
};

export function CardTile({
  card,
  onOpen,
  compactLabels = false,
  isDragging,
  disabled,
}: {
  card: CardData;
  onOpen: () => void;
  compactLabels?: boolean;
  isDragging?: boolean;
  disabled?: boolean;
}) {
  const sortable = useSortable({ id: card.id, data: { type: 'card', card }, disabled });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sorting,
  } = sortable;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const items = card.checklists.flatMap((c) => c.items);
  const done = items.filter((i) => i.isDone).length;
  const subtasks = card.children ?? [];
  const subtasksDone = subtasks.filter((c) => c.isComplete).length;
  const comments = card._count?.comments ?? 0;
  const attachments = card._count?.attachments ?? card.attachments?.length ?? 0;
  const due = dueState(card.dueDate, card.isComplete);
  const priority = PRIORITIES.find((p) => p.value === card.priority);
  const hasCover = card.coverType && card.coverValue;
  const fullCover = hasCover && card.coverSize === 'full' && card.coverType === 'image';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        'card-tile glass group relative cursor-pointer overflow-hidden text-left',
        (sorting || isDragging) && 'dragging-card',
        'hover:shadow-lift active:cursor-grabbing'
      )}
    >
      {card.color && (
        <span
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: card.color }}
          aria-hidden
        />
      )}

      {hasCover && !fullCover && (
        <div
          className="h-20 w-full"
          style={
            card.coverType === 'image'
              ? {
                  backgroundImage: `url(${withBase(card.coverValue)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : { background: card.coverValue as string }
          }
        />
      )}

      {fullCover && (
        <div
          className="relative flex min-h-[6.5rem] items-end p-2.5"
          style={{
            backgroundImage: `linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.15)), url(${withBase(
              card.coverValue
            )})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <span className="text-sm font-semibold leading-snug text-white drop-shadow">
            {card.title}
          </span>
        </div>
      )}

      {!fullCover && (
        <div className={cn('p-2.5', card.color && 'pl-3.5')}>
          {card.labels.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {card.labels.map(({ label }) => (
                <span
                  key={label.id}
                  title={label.name}
                  className={cn(
                    'rounded-xs text-[10px] font-semibold leading-none transition-all',
                    compactLabels ? 'h-1.5 w-8' : 'px-1.5 py-1'
                  )}
                  style={{
                    background: `${label.color}2e`,
                    color: compactLabels ? undefined : label.color,
                    backgroundColor: compactLabels ? label.color : `${label.color}2e`,
                  }}
                >
                  {compactLabels ? '' : label.name || ' '}
                </span>
              ))}
            </div>
          )}

          <p
            className={cn(
              'text-[13.5px] font-medium leading-snug',
              card.isComplete && 'text-muted line-through'
            )}
          >
            {card.title}
          </p>

          {(due !== 'none' ||
            comments > 0 ||
            attachments > 0 ||
            items.length > 0 ||
            subtasks.length > 0 ||
            card.parentId ||
            card.description ||
            priority?.value !== 'NONE') && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              {priority && priority.value !== 'NONE' && (
                <span
                  className="chip"
                  style={{ background: `${priority.color}22`, color: priority.color }}
                  title={`${priority.label} priority`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: priority.color }} />
                  {priority.label}
                </span>
              )}
              {due !== 'none' && (
                <span className={cn('chip', DUE_STYLES[due])} title="Due date">
                  <Clock size={11} />
                  {formatDate(card.dueDate)}
                </span>
              )}
              {card.description && <AlignLeft size={13} className="opacity-70" />}
              {card.parentId && (
                <span
                  className="flex items-center gap-1 opacity-70"
                  title={card.parent ? `Subtask of #${card.parent.number} ${card.parent.title}` : 'Subtask'}
                >
                  <CornerDownRight size={12} />
                </span>
              )}
              {subtasks.length > 0 && (
                <span
                  className={cn('chip', subtasksDone === subtasks.length && 'bg-success/16 text-success')}
                  title="Subtasks"
                >
                  <GitBranch size={11} />
                  {subtasksDone}/{subtasks.length}
                </span>
              )}
              {items.length > 0 && (
                <span
                  className={cn('chip', done === items.length && 'bg-success/16 text-success')}
                  title="Checklist"
                >
                  <CheckSquare size={11} />
                  {done}/{items.length}
                </span>
              )}
              {comments > 0 && (
                <span className="flex items-center gap-1" title="Comments">
                  <MessageSquare size={12} />
                  {comments}
                </span>
              )}
              {attachments > 0 && (
                <span className="flex items-center gap-1" title="Attachments">
                  <Paperclip size={12} />
                  {attachments}
                </span>
              )}
            </div>
          )}

          {card.assignees.length > 0 && (
            <div className="mt-2 flex items-center justify-end -space-x-1.5">
              {card.assignees.slice(0, 4).map(({ user }) => (
                <span
                  key={user.id}
                  title={user.name}
                  style={{ background: user.avatarColor }}
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface"
                >
                  {user.avatarUrl ? (
                    <img
                      src={withBase(user.avatarUrl)}
                      className="h-full w-full rounded-full object-cover"
                      alt=""
                    />
                  ) : (
                    initials(user.name)
                  )}
                </span>
              ))}
              {card.assignees.length > 4 && (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-surface3 text-[10px] font-semibold ring-2 ring-surface">
                  +{card.assignees.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Non-interactive copy used inside the drag overlay. */
export function CardTileGhost({ card }: { card: CardData }) {
  return (
    <div className="drag-overlay w-[17.5rem]">
      <div className="glass pointer-events-none overflow-hidden rounded-lg p-2.5">
        <p className="text-[13.5px] font-medium leading-snug">{card.title}</p>
      </div>
    </div>
  );
}
