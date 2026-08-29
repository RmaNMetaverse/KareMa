import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, Copy, GripVertical, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MenuItem, Popover } from '../ui';
import { CardData, CardTile } from './CardTile';

export type ListData = {
  id: string;
  title: string;
  color?: string | null;
  wipLimit?: number | null;
  position: number;
  cards: CardData[];
};

export function ListColumn({
  list,
  canEdit,
  compactLabels,
  onOpenCard,
  onAddCard,
  onRename,
  onSetColor,
  onSetWip,
  onDuplicate,
  onArchiveCards,
  onDelete,
  childCounts,
  foldedCards,
  onToggleSubtasks,
}: {
  list: ListData;
  canEdit: boolean;
  compactLabels: boolean;
  onOpenCard: (cardId: string) => void;
  onAddCard: (listId: string, title: string, atTop: boolean) => Promise<void>;
  onRename: (listId: string, title: string) => void;
  onSetColor: (listId: string, color: string | null) => void;
  onSetWip: (listId: string, wip: number | null) => void;
  onDuplicate: (listId: string) => void;
  onArchiveCards: (listId: string) => void;
  onDelete: (listId: string) => void;
  /** card id -> how many of its sub-tasks are in this list */
  childCounts?: Record<string, number>;
  foldedCards?: Set<string>;
  onToggleSubtasks?: (cardId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `list:${list.id}`, data: { type: 'list', list }, disabled: !canEdit });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${list.id}`,
    data: { type: 'list-drop', listId: list.id },
  });

  const [composerOpen, setComposerOpen] = useState<false | 'top' | 'bottom'>(false);
  const [draft, setDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setTitleDraft(list.title), [list.title]);
  useEffect(() => {
    if (composerOpen) composerRef.current?.focus();
  }, [composerOpen]);

  const submitCard = async () => {
    const value = draft.trim();
    if (!value) {
      setComposerOpen(false);
      return;
    }
    await onAddCard(list.id, value, composerOpen === 'top');
    setDraft('');
    composerRef.current?.focus();
  };

  const overLimit = list.wipLimit != null && list.wipLimit > 0 && list.cards.length > list.wipLimit;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      className={cn(
        'flex w-[18.5rem] shrink-0 flex-col self-start',
        isDragging && 'opacity-40'
      )}
    >
      <div className="glass glass-sheen flex max-h-[calc(100vh-8.5rem)] flex-col rounded-xl">
        {/* header */}
        <div className="flex items-center gap-1.5 px-2.5 pt-2.5">
          {canEdit && (
            <button
              ref={setActivatorNodeRef}
              {...listeners}
              className="cursor-grab text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 active:cursor-grabbing"
              aria-label="Reorder list"
            >
              <GripVertical size={14} />
            </button>
          )}
          {list.color && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: list.color }} />
          )}

          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (titleDraft.trim() && titleDraft !== list.title) onRename(list.id, titleDraft.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setTitleDraft(list.title);
                  setEditingTitle(false);
                }
              }}
              className="input py-1 text-sm font-semibold"
            />
          ) : (
            <button
              onClick={() => canEdit && setEditingTitle(true)}
              className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold"
            >
              {list.title}
            </button>
          )}

          <span
            className={cn(
              'shrink-0 rounded-xs px-1.5 py-0.5 text-[11px] font-medium',
              overLimit ? 'bg-danger/16 text-danger' : 'text-muted'
            )}
            title={list.wipLimit ? `WIP limit: ${list.wipLimit}` : undefined}
          >
            {list.cards.length}
            {list.wipLimit ? `/${list.wipLimit}` : ''}
          </span>

          {canEdit && (
            <Popover
              align="right"
              width="w-56"
              trigger={({ toggle }) => (
                <button className="btn btn-ghost btn-icon shrink-0" onClick={toggle} aria-label="List actions">
                  <MoreHorizontal size={15} />
                </button>
              )}
            >
              {(close) => (
                <div>
                  <MenuItem
                    icon={<Plus size={14} />}
                    onClick={() => {
                      close();
                      setComposerOpen('top');
                    }}
                  >
                    Add card to top
                  </MenuItem>
                  <MenuItem
                    icon={<Copy size={14} />}
                    onClick={() => {
                      close();
                      onDuplicate(list.id);
                    }}
                  >
                    Duplicate list
                  </MenuItem>
                  <div className="divider my-1.5" />
                  <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Colour
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
                    {[null, '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7'].map(
                      (c) => (
                        <button
                          key={c ?? 'none'}
                          onClick={() => onSetColor(list.id, c)}
                          className={cn(
                            'h-6 w-6 rounded-full border border-line transition-transform hover:scale-110',
                            list.color === c && 'ring-2 ring-ink ring-offset-1 ring-offset-surface'
                          )}
                          style={{ background: c ?? 'transparent' }}
                        />
                      )
                    )}
                  </div>
                  <div className="px-2.5 pb-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      WIP limit
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="input mt-1 py-1"
                      placeholder="No limit"
                      defaultValue={list.wipLimit ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        onSetWip(list.id, v === '' ? null : Math.max(0, Number(v)));
                      }}
                    />
                  </div>
                  <div className="divider my-1.5" />
                  <MenuItem
                    icon={<Archive size={14} />}
                    onClick={() => {
                      close();
                      onArchiveCards(list.id);
                    }}
                  >
                    Archive all cards
                  </MenuItem>
                  <MenuItem
                    icon={<Trash2 size={14} />}
                    danger
                    onClick={() => {
                      close();
                      onDelete(list.id);
                    }}
                  >
                    Delete list
                  </MenuItem>
                </div>
              )}
            </Popover>
          )}
        </div>

        {list.color && (
          <span
            className="mx-2.5 mt-2 h-0.5 rounded-full"
            style={{ background: list.color, opacity: 0.65 }}
          />
        )}

        {/* cards */}
        <div
          ref={setDropRef}
          className={cn(
            'min-h-[0.75rem] flex-1 space-y-2 overflow-y-auto p-2.5 transition-colors',
            isOver && 'bg-primary/6'
          )}
        >
          {composerOpen === 'top' && (
            <Composer
              inputRef={composerRef}
              value={draft}
              onChange={setDraft}
              onSubmit={submitCard}
              onCancel={() => {
                setComposerOpen(false);
                setDraft('');
              }}
            />
          )}

          <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {list.cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                compactLabels={compactLabels}
                disabled={!canEdit}
                onOpen={() => onOpenCard(card.id)}
                foldable={childCounts?.[card.id] ?? 0}
                folded={foldedCards?.has(card.id) ?? false}
                onToggleSubtasks={onToggleSubtasks ? () => onToggleSubtasks(card.id) : undefined}
              />
            ))}
          </SortableContext>

          {composerOpen === 'bottom' && (
            <Composer
              inputRef={composerRef}
              value={draft}
              onChange={setDraft}
              onSubmit={submitCard}
              onCancel={() => {
                setComposerOpen(false);
                setDraft('');
              }}
            />
          )}

          {list.cards.length === 0 && !composerOpen && (
            <p className="py-6 text-center text-xs text-muted">Drop cards here</p>
          )}
        </div>

        {canEdit && composerOpen !== 'bottom' && (
          <button
            onClick={() => setComposerOpen('bottom')}
            className="flex items-center gap-2 rounded-b-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface3/50 hover:text-ink"
          >
            <Plus size={15} />
            Add a card
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({
  inputRef,
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="animate-scale-in rounded-lg border border-primary/40 bg-surface p-2 shadow-soft">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === 'Escape') onCancel();
        }}
        rows={2}
        placeholder="Card title — Enter to save"
        className="w-full resize-none bg-transparent text-[13.5px] outline-none placeholder:text-muted"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button className="btn btn-primary py-1 text-xs" onClick={onSubmit}>
          Add card
        </button>
        <button className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Cancel">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
