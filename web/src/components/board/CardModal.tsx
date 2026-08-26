import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Archive,
  CalendarDays,
  Check,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Plus,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { del, get, patch, post, uploadFile } from '../../lib/api';
import { useApp } from '../../store/app';
import { withBase } from '../../lib/base';
import { getSocket } from '../../lib/socket';
import {
  CARD_COLORS,
  cn,
  dueState,
  formatBytes,
  formatDate,
  GRADIENTS,
  PRIORITIES,
  renderRichText,
  timeAgo,
} from '../../lib/utils';
import { Avatar, ConfirmDialog, MenuItem, Modal, Popover, Spinner } from '../ui';
import { RichTextEditor } from './RichTextEditor';
import { ParentBreadcrumb, ParentPicker, Subtasks } from './Subtasks';
import { CommentComposer, CommentItem } from './CommentThread';

type Props = {
  cardId: string;
  board: any;
  onClose: () => void;
  onChanged: () => void;
  onOpenCard?: (id: string) => void;
};

export function CardModal({ cardId, board, onClose, onChanged, onOpenCard }: Props) {
  const { user, toast } = useApp();
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [uploads, setUploads] = useState<{ name: string; pct: number }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newChecklist, setNewChecklist] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const people = useMemo(
    () => (board?.members ?? []).map((m: any) => m.user),
    [board]
  );
  const canEdit = board?.canEdit ?? false;

  const load = useCallback(async () => {
    try {
      const res = await get<{ card: any }>(`/api/cards/${cardId}`);
      setCard(res.card);
      setTitleDraft(res.card.title);
      setDescDraft(res.card.description || '');
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [cardId, onClose, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // live comments from other people
  useEffect(() => {
    const socket = getSocket();
    const onComment = (payload: any) => {
      if (payload.cardId !== cardId) return;
      setCard((prev: any) =>
        prev
          ? {
              ...prev,
              comments: prev.comments.some((c: any) => c.id === payload.comment.id)
                ? prev.comments.map((c: any) => (c.id === payload.comment.id ? payload.comment : c))
                : [...prev.comments, payload.comment],
            }
          : prev
      );
    };
    const onCommentDeleted = (payload: any) => {
      if (payload.cardId !== cardId) return;
      setCard((prev: any) =>
        prev ? { ...prev, comments: prev.comments.filter((c: any) => c.id !== payload.id) } : prev
      );
    };
    socket.on('comment:created', onComment);
    socket.on('comment:updated', onComment);
    socket.on('comment:deleted', onCommentDeleted);
    return () => {
      socket.off('comment:created', onComment);
      socket.off('comment:updated', onComment);
      socket.off('comment:deleted', onCommentDeleted);
    };
  }, [cardId]);

  const update = async (data: Record<string, unknown>) => {
    setCard((prev: any) => ({ ...prev, ...data }));
    try {
      const res = await patch<{ card: any }>(`/api/cards/${cardId}`, data);
      setCard((prev: any) => ({ ...prev, ...res.card }));
      onChanged();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
      load();
    }
  };

  const doUpload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setUploads((prev) => [...prev, { name: file.name, pct: 0 }]);
      try {
        await uploadFile(cardId, file, (pct) =>
          setUploads((prev) => prev.map((u) => (u.name === file.name ? { ...u, pct } : u)))
        );
        await load();
        onChanged();
      } catch (err: any) {
        toast({ title: `Could not upload ${file.name}`, description: err.message, tone: 'error' });
      } finally {
        setUploads((prev) => prev.filter((u) => u.name !== file.name));
      }
    }
  };

  const removeCard = async () => {
    try {
      await del(`/api/cards/${cardId}`);
      toast({ title: 'Card deleted', tone: 'success' });
      onChanged();
      onClose();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    }
  };

  const images = (card?.attachments ?? []).filter((a: any) => a.kind === 'image');
  const due = dueState(card?.dueDate, card?.isComplete);
  const priority = PRIORITIES.find((p) => p.value === card?.priority);
  const checklistItems = (card?.checklists ?? []).flatMap((c: any) => c.items);
  const checklistDone = checklistItems.filter((i: any) => i.isDone).length;

  return (
    <Modal open onClose={onClose} width="max-w-4xl" label="Card details">
      {loading || !card ? (
        <div className="flex h-64 items-center justify-center text-muted">
          <Spinner size={22} />
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files);
          }}
          className="relative"
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary/12 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-primary">
                <Upload size={28} />
                <p className="text-sm font-semibold">Drop files to attach</p>
              </div>
            </div>
          )}

          {/* cover */}
          {card.coverType && card.coverValue && (
            <div
              className="relative h-32 rounded-t-2xl sm:h-40"
              style={
                card.coverType === 'image'
                  ? {
                      backgroundImage: `url(${withBase(card.coverValue)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : { background: card.coverValue }
              }
            >
              {canEdit && (
                <button
                  className="absolute bottom-3 right-3 rounded-md bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/60"
                  onClick={() => update({ coverType: null, coverValue: null })}
                >
                  Remove cover
                </button>
              )}
            </div>
          )}

          <div className="flex items-start gap-3 px-5 pb-1 pt-4">
            {canEdit && (
              <button
                onClick={() => update({ isComplete: !card.isComplete })}
                className={cn(
                  'mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                  card.isComplete
                    ? 'border-success bg-success text-white'
                    : 'border-line hover:border-success'
                )}
                aria-label="Toggle complete"
              >
                {card.isComplete && <Check size={12} strokeWidth={3} />}
              </button>
            )}
            <div className="min-w-0 flex-1">
              {card.parent && (
                <ParentBreadcrumb
                  parent={card.parent}
                  cardId={card.id}
                  canEdit={canEdit}
                  onChanged={load}
                  onOpenCard={onOpenCard}
                />
              )}
              <textarea
                value={titleDraft}
                disabled={!canEdit}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  const v = titleDraft.trim();
                  if (v && v !== card.title) update({ title: v });
                  else setTitleDraft(card.title);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                rows={1}
                className="w-full resize-none bg-transparent text-lg font-bold leading-snug outline-none focus:rounded-sm focus:bg-surface2/60 focus:px-2"
              />
              <p className="mt-0.5 text-xs text-muted">
                #{card.number} in{' '}
                <span className="font-medium text-ink">
                  {board.lists.find((l: any) => l.id === card.listId)?.title ?? 'list'}
                </span>{' '}
                · added {timeAgo(card.createdAt)}
              </p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-5 px-5 pb-5 pt-3 md:grid-cols-[1fr_13rem]">
            {/* ------------------------------------------------------ main */}
            <div className="min-w-0 space-y-5">
              {canEdit && (
                <div className="flex flex-wrap gap-1.5">
                  <MembersPicker card={card} people={people} onChanged={load} />
                  <LabelsPicker card={card} board={board} onChanged={load} />
                  <DatesPicker card={card} onUpdate={update} />
                  <PriorityPicker card={card} onUpdate={update} />
                  <CoverPicker card={card} images={images} onUpdate={update} />
                  <button className="btn btn-subtle text-xs" onClick={() => fileRef.current?.click()}>
                    <Paperclip size={14} /> Attach
                  </button>
                  <button className="btn btn-subtle text-xs" onClick={() => setNewChecklist(true)}>
                    <CheckSquare size={14} /> Checklist
                  </button>
                  <ParentPicker card={card} onChanged={load} />
                  <ColorPicker card={card} onUpdate={update} />
                </div>
              )}

              {/* pinned facts */}
              {(card.assignees.length > 0 ||
                card.labels.length > 0 ||
                card.dueDate ||
                priority?.value !== 'NONE') && (
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {card.assignees.length > 0 && (
                    <Detail label="Assigned to">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {card.assignees.map((a: any) => (
                          <span
                            key={a.user.id}
                            className="flex items-center gap-1.5 rounded-full bg-surface2 py-0.5 pl-0.5 pr-2 text-xs"
                          >
                            <Avatar user={a.user} size={20} />
                            {a.user.name}
                            {canEdit && (
                              <button
                                onClick={async () => {
                                  await del(`/api/cards/${card.id}/assignees/${a.user.id}`);
                                  load();
                                  onChanged();
                                }}
                                className="text-muted hover:text-danger"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </Detail>
                  )}

                  {card.labels.length > 0 && (
                    <Detail label="Labels">
                      <div className="flex flex-wrap gap-1.5">
                        {card.labels.map(({ label }: any) => (
                          <span
                            key={label.id}
                            className="chip"
                            style={{ background: `${label.color}2e`, color: label.color }}
                          >
                            {label.name || 'Unnamed'}
                          </span>
                        ))}
                      </div>
                    </Detail>
                  )}

                  {card.dueDate && (
                    <Detail label="Due">
                      <span
                        className={cn(
                          'chip',
                          due === 'overdue'
                            ? 'bg-danger/16 text-danger'
                            : due === 'done'
                              ? 'bg-success/16 text-success'
                              : 'bg-surface2'
                        )}
                      >
                        <CalendarDays size={12} />
                        {formatDate(card.dueDate, true)}
                        {due === 'overdue' && ' · overdue'}
                      </span>
                    </Detail>
                  )}

                  {priority && priority.value !== 'NONE' && (
                    <Detail label="Priority">
                      <span
                        className="chip"
                        style={{ background: `${priority.color}22`, color: priority.color }}
                      >
                        <Flag size={12} />
                        {priority.label}
                      </span>
                    </Detail>
                  )}
                </div>
              )}

              {/* description */}
              <section>
                <SectionTitle icon={<AlignLeft size={15} />}>Description</SectionTitle>
                {editingDesc ? (
                  <div className="mt-2">
                    <RichTextEditor
                      value={descDraft}
                      onChange={setDescDraft}
                      people={people}
                      rows={7}
                      autoFocus
                      placeholder="Add more detail. Use the toolbar, or type @ to mention someone."
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        className="btn btn-primary py-1 text-xs"
                        onClick={() => {
                          update({ description: descDraft.trim() || null });
                          setEditingDesc(false);
                        }}
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-ghost py-1 text-xs"
                        onClick={() => {
                          setDescDraft(card.description || '');
                          setEditingDesc(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : card.description ? (
                  <div
                    onClick={() => canEdit && setEditingDesc(true)}
                    className={cn(
                      'prose-mini mt-2 rounded-md px-3 py-2.5 text-sm leading-relaxed',
                      canEdit && 'cursor-text hover:bg-surface2/60'
                    )}
                    dangerouslySetInnerHTML={{ __html: renderRichText(card.description) }}
                  />
                ) : (
                  canEdit && (
                    <button
                      onClick={() => setEditingDesc(true)}
                      className="mt-2 w-full rounded-md bg-surface2/60 px-3 py-3 text-left text-sm text-muted transition-colors hover:bg-surface2"
                    >
                      Add a more detailed description...
                    </button>
                  )
                )}
              </section>

              <Subtasks
                card={card}
                canEdit={canEdit}
                onChanged={load}
                onOpenCard={onOpenCard}
              />

              {/* checklists */}
              {(card.checklists.length > 0 || newChecklist) && (
                <section>
                  <SectionTitle icon={<CheckSquare size={15} />}>
                    Checklist
                    {checklistItems.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        {checklistDone}/{checklistItems.length}
                      </span>
                    )}
                  </SectionTitle>

                  {checklistItems.length > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface3">
                      <div
                        className="h-full rounded-full bg-success transition-[width] duration-300"
                        style={{ width: `${(checklistDone / checklistItems.length) * 100}%` }}
                      />
                    </div>
                  )}

                  <div className="mt-3 space-y-4">
                    {card.checklists.map((cl: any) => (
                      <Checklist
                        key={cl.id}
                        cardId={card.id}
                        checklist={cl}
                        canEdit={canEdit}
                        onChanged={(next) => {
                          setCard(next);
                          onChanged();
                        }}
                      />
                    ))}
                  </div>

                  {newChecklist && (
                    <AddInline
                      placeholder="Checklist title"
                      onCancel={() => setNewChecklist(false)}
                      onSubmit={async (title) => {
                        const res = await post<{ card: any }>(`/api/cards/${card.id}/checklists`, {
                          title,
                        });
                        setCard((prev: any) => ({ ...prev, ...res.card }));
                        setNewChecklist(false);
                        onChanged();
                      }}
                    />
                  )}
                </section>
              )}

              {/* attachments */}
              {(card.attachments.length > 0 || uploads.length > 0) && (
                <section>
                  <SectionTitle icon={<Paperclip size={15} />}>
                    Attachments
                    <span className="ml-2 text-xs font-normal text-muted">
                      {card.attachments.length}
                    </span>
                  </SectionTitle>

                  {uploads.map((u) => (
                    <div key={u.name} className="mt-2 rounded-md bg-surface2/60 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{u.name}</span>
                        <span className="text-muted">{u.pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface3">
                        <div
                          className="h-full bg-primary transition-[width]"
                          style={{ width: `${u.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {card.attachments.map((a: any) => (
                      <Attachment
                        key={a.id}
                        attachment={a}
                        canEdit={canEdit}
                        isCover={card.coverValue?.includes(a.storedName)}
                        onSetCover={() =>
                          update({ coverType: 'image', coverValue: `/api/files/${a.storedName}` })
                        }
                        onDelete={async () => {
                          await del(`/api/attachments/${a.id}`);
                          load();
                          onChanged();
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* comments */}
              <section>
                <SectionTitle icon={<AlignLeft size={15} />}>
                  Comments
                  <span className="ml-2 text-xs font-normal text-muted">
                    {card.comments.length}
                  </span>
                </SectionTitle>

                {canEdit && (
                  <div className="mt-3">
                    <CommentComposer
                      cardId={cardId}
                      people={people}
                      onPosted={(posted) => {
                        setCard((prev: any) => ({
                          ...prev,
                          comments: prev.comments.some((c: any) => c.id === posted.id)
                            ? prev.comments.map((c: any) => (c.id === posted.id ? posted : c))
                            : [...prev.comments, posted],
                        }));
                        onChanged();
                      }}
                    />
                  </div>
                )}

                <div className="mt-4 space-y-3.5">
                  {[...card.comments].reverse().map((c: any) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      cardId={cardId}
                      people={people}
                      canManage={c.author.id === user?.id || !!user?.permissions?.['admin.access']}
                      onChanged={load}
                    />
                  ))}
                  {card.comments.length === 0 && (
                    <p className="text-sm text-muted">No comments yet.</p>
                  )}
                </div>
              </section>

              {/* activity */}
              {card.activities?.length > 0 && (
                <section>
                  <SectionTitle icon={<Eye size={15} />}>Activity</SectionTitle>
                  <ul className="mt-2.5 space-y-2">
                    {card.activities.slice(0, 12).map((a: any) => (
                      <li key={a.id} className="flex items-start gap-2.5 text-xs text-muted">
                        <Avatar user={a.user} size={20} />
                        <span className="flex-1">
                          <span className="font-medium text-ink">{a.user.name}</span>{' '}
                          {describeActivity(a)}
                          <span className="ml-1.5 opacity-70">{timeAgo(a.createdAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* --------------------------------------------------- sidebar */}
            <aside className="space-y-1.5">
              <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Actions
              </p>
              <SideButton
                icon={card.isWatching ? <EyeOff size={14} /> : <Eye size={14} />}
                onClick={async () => {
                  const res = await post<{ isWatching: boolean }>(`/api/cards/${card.id}/watch`);
                  setCard((prev: any) => ({ ...prev, isWatching: res.isWatching }));
                  toast({
                    title: res.isWatching ? 'Watching this card' : 'Stopped watching',
                    tone: 'info',
                  });
                }}
              >
                {card.isWatching ? 'Unwatch' : 'Watch'}
              </SideButton>

              {canEdit && (
                <>
                  <SideButton
                    icon={<Copy size={14} />}
                    onClick={async () => {
                      await post(`/api/cards/${card.id}/duplicate`);
                      toast({ title: 'Card duplicated', tone: 'success' });
                      onChanged();
                      onClose();
                    }}
                  >
                    Duplicate
                  </SideButton>
                  <SideButton
                    icon={<Archive size={14} />}
                    onClick={async () => {
                      await update({ isArchived: true });
                      toast({ title: 'Card archived', tone: 'success' });
                      onChanged();
                      onClose();
                    }}
                  >
                    Archive
                  </SideButton>
                  <SideButton icon={<Trash2 size={14} />} danger onClick={() => setConfirmDelete(true)}>
                    Delete
                  </SideButton>
                </>
              )}

              <div className="divider my-3" />
              <p className="px-1 text-[11px] text-muted">
                Created by <span className="font-medium text-ink">{card.createdBy?.name}</span>
              </p>
            </aside>
          </div>

          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) doUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this card?"
        message="The card, its comments and its attachments will be permanently removed."
        confirmLabel="Delete card"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={removeCard}
      />
    </Modal>
  );
}

/* ------------------------------------------------------------------- pieces */

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-muted">{icon}</span>
      {children}
    </h3>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

function SideButton({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors',
        danger ? 'text-danger hover:bg-danger/12' : 'bg-surface2/60 hover:bg-surface3'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function AddInline({
  placeholder,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-2 flex gap-1.5">
      <input
        autoFocus
        className="input py-1.5 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onSubmit(value.trim());
            setValue('');
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        className="btn btn-primary py-1 text-xs"
        onClick={() => {
          if (value.trim()) {
            onSubmit(value.trim());
            setValue('');
          }
        }}
      >
        Add
      </button>
      <button className="btn btn-ghost btn-icon" onClick={onCancel}>
        <X size={15} />
      </button>
    </div>
  );
}

function Checklist({
  cardId,
  checklist,
  canEdit,
  onChanged,
}: {
  cardId: string;
  checklist: any;
  canEdit: boolean;
  onChanged: (card: any) => void;
}) {
  const [adding, setAdding] = useState(false);

  const toggle = async (item: any) => {
    if (!canEdit) return;
    const res = await patch<{ card: any }>(`/api/cards/${cardId}/checklist-items/${item.id}`, {
      isDone: !item.isDone,
    });
    onChanged(res.card);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-sm font-medium">{checklist.title}</h4>
        {canEdit && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={async () => {
              const res = await del<{ card: any }>(`/api/cards/${cardId}/checklists/${checklist.id}`);
              onChanged(res.card);
            }}
            aria-label="Delete checklist"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <ul className="mt-1.5 space-y-0.5">
        {checklist.items.map((item: any) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-sm px-1 py-1 hover:bg-surface2/60">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.isDone}
              aria-label={item.text}
              disabled={!canEdit}
              onClick={() => toggle(item)}
              className={cn(
                // border-line is far too faint against the card panel to read as a
                // control, so an empty box looked like no box at all
                'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-xs border-2 transition-colors',
                item.isDone
                  ? 'border-success bg-success text-white'
                  : 'border-muted bg-surface3/50 text-transparent',
                canEdit &&
                  !item.isDone &&
                  'hover:border-success hover:bg-success/15 hover:text-success/70',
                !canEdit && 'cursor-default opacity-70'
              )}
            >
              {/* always rendered, so hovering an empty box previews the tick */}
              <Check size={12} strokeWidth={3} />
            </button>
            <span
              onClick={() => toggle(item)}
              className={cn(
                'flex-1 text-[13px]',
                canEdit && 'cursor-pointer',
                item.isDone && 'text-muted line-through'
              )}
            >
              {item.text}
            </span>
            {canEdit && (
              <button
                className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                onClick={async () => {
                  const res = await del<{ card: any }>(
                    `/api/cards/${cardId}/checklist-items/${item.id}`
                  );
                  onChanged(res.card);
                }}
              >
                <X size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit &&
        (adding ? (
          <AddInline
            placeholder="Add an item"
            onCancel={() => setAdding(false)}
            onSubmit={async (text) => {
              const res = await post<{ card: any }>(
                `/api/cards/${cardId}/checklists/${checklist.id}/items`,
                { text }
              );
              onChanged(res.card);
            }}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-1 flex items-center gap-1.5 rounded-sm px-1 py-1 text-xs text-muted transition-colors hover:text-ink"
          >
            <Plus size={13} /> Add an item
          </button>
        ))}
    </div>
  );
}

function Attachment({
  attachment,
  canEdit,
  isCover,
  onSetCover,
  onDelete,
}: {
  attachment: any;
  canEdit: boolean;
  isCover: boolean;
  onSetCover: () => void;
  onDelete: () => void;
}) {
  const href =
    attachment.kind === 'link' ? attachment.url : withBase(`/api/files/${attachment.storedName}`);

  return (
    <div className="glass group overflow-hidden rounded-lg">
      {attachment.kind === 'image' && (
        <a href={href} target="_blank" rel="noreferrer">
          <img src={href} alt={attachment.filename} className="h-28 w-full object-cover" />
        </a>
      )}
      {attachment.kind === 'video' && (
        <video src={href} controls className="h-28 w-full bg-black object-contain" />
      )}
      {attachment.kind === 'audio' && <audio src={href} controls className="w-full p-2" />}

      <div className="flex items-center gap-2 p-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface3/70 text-muted">
          {attachment.kind === 'link' ? <Link2 size={14} /> : <Paperclip size={14} />}
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs font-medium hover:underline"
          >
            {attachment.filename}
          </a>
          <p className="text-[11px] text-muted">
            {attachment.kind === 'link' ? 'Link' : formatBytes(attachment.size)} ·{' '}
            {timeAgo(attachment.createdAt)}
          </p>
        </div>
        {canEdit && (
          <Popover
            align="right"
            width="w-44"
            trigger={({ toggle }) => (
              <button className="btn btn-ghost btn-icon" onClick={toggle}>
                <X size={14} className="rotate-45" />
              </button>
            )}
          >
            {(close) => (
              <div>
                {attachment.kind === 'image' && !isCover && (
                  <MenuItem
                    icon={<ImageIcon size={14} />}
                    onClick={() => {
                      close();
                      onSetCover();
                    }}
                  >
                    Use as cover
                  </MenuItem>
                )}
                <MenuItem
                  icon={<Trash2 size={14} />}
                  danger
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Remove
                </MenuItem>
              </div>
            )}
          </Popover>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pickers */

function MembersPicker({
  card,
  people,
  onChanged,
}: {
  card: any;
  people: any[];
  onChanged: () => void;
}) {
  const assigned = new Set(card.assignees.map((a: any) => a.user.id));
  return (
    <Popover
      width="w-60"
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <UserPlus size={14} /> Members
        </button>
      )}
    >
      <div className="max-h-64 overflow-y-auto">
        {people.map((p: any) => (
          <button
            key={p.id}
            onClick={async () => {
              if (assigned.has(p.id)) await del(`/api/cards/${card.id}/assignees/${p.id}`);
              else await post(`/api/cards/${card.id}/assignees`, { userId: p.id });
              onChanged();
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface3/60"
          >
            <Avatar user={p} size={24} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {assigned.has(p.id) && <Check size={14} className="text-primary" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function LabelsPicker({ card, board, onChanged }: { card: any; board: any; onChanged: () => void }) {
  const applied = new Set(card.labels.map((l: any) => l.label.id));
  return (
    <Popover
      width="w-60"
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <Tag size={14} /> Labels
        </button>
      )}
    >
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {board.labels.map((l: any) => (
          <button
            key={l.id}
            onClick={async () => {
              await post(`/api/cards/${card.id}/labels/${l.id}`);
              onChanged();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 transition-colors hover:bg-surface3/60"
          >
            <span
              className="h-6 flex-1 rounded-sm px-2 text-left text-xs font-semibold leading-6"
              style={{ background: `${l.color}2e`, color: l.color }}
            >
              {l.name || 'Unnamed'}
            </span>
            {applied.has(l.id) && <Check size={14} className="text-primary" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function DatesPicker({ card, onUpdate }: { card: any; onUpdate: (d: any) => void }) {
  const toLocal = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  };

  return (
    <Popover
      width="w-64"
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <CalendarDays size={14} /> Dates
        </button>
      )}
    >
      <div className="space-y-3 p-1">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Start
          </span>
          <input
            type="datetime-local"
            className="input py-1.5 text-xs"
            value={toLocal(card.startDate)}
            onChange={(e) =>
              onUpdate({ startDate: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Due
          </span>
          <input
            type="datetime-local"
            className="input py-1.5 text-xs"
            value={toLocal(card.dueDate)}
            onChange={(e) =>
              onUpdate({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </label>
        {(card.startDate || card.dueDate) && (
          <button
            className="btn btn-ghost w-full py-1 text-xs"
            onClick={() => onUpdate({ startDate: null, dueDate: null })}
          >
            Clear dates
          </button>
        )}
      </div>
    </Popover>
  );
}

function PriorityPicker({ card, onUpdate }: { card: any; onUpdate: (d: any) => void }) {
  return (
    <Popover
      width="w-44"
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <Flag size={14} /> Priority
        </button>
      )}
    >
      {(close) =>
        PRIORITIES.map((p) => (
          <MenuItem
            key={p.value}
            active={card.priority === p.value}
            onClick={() => {
              onUpdate({ priority: p.value });
              close();
            }}
            icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />}
          >
            {p.label}
          </MenuItem>
        ))
      }
    </Popover>
  );
}

function ColorPicker({ card, onUpdate }: { card: any; onUpdate: (d: any) => void }) {
  return (
    <Popover
      width="w-52"
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <span
            className="h-3 w-3 rounded-full border border-line"
            style={{ background: card.color || 'transparent' }}
          />
          Colour
        </button>
      )}
    >
      <div className="flex flex-wrap gap-1.5 p-1">
        {CARD_COLORS.map((c) => (
          <button
            key={c.name}
            title={c.name}
            onClick={() => onUpdate({ color: c.value })}
            className={cn(
              'h-7 w-7 rounded-full border border-line transition-transform hover:scale-110',
              card.color === c.value && 'ring-2 ring-ink ring-offset-1 ring-offset-surface'
            )}
            style={{ background: c.value ?? 'transparent' }}
          />
        ))}
      </div>
    </Popover>
  );
}

function CoverPicker({
  card,
  images,
  onUpdate,
}: {
  card: any;
  images: any[];
  onUpdate: (d: any) => void;
}) {
  return (
    <Popover
      width="w-72"
      trigger={({ toggle }) => (
        <button className="btn btn-subtle text-xs" onClick={toggle}>
          <ImageIcon size={14} /> Cover
        </button>
      )}
    >
      <div className="space-y-3 p-1">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Colours
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CARD_COLORS.filter((c) => c.value).map((c) => (
              <button
                key={c.name}
                onClick={() => onUpdate({ coverType: 'color', coverValue: c.value })}
                className="h-7 w-9 rounded-sm transition-transform hover:scale-105"
                style={{ background: c.value! }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Gradients
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {GRADIENTS.map((g) => (
              <button
                key={g}
                onClick={() => onUpdate({ coverType: 'gradient', coverValue: g })}
                className="h-7 rounded-sm transition-transform hover:scale-105"
                style={{ background: g }}
              />
            ))}
          </div>
        </div>

        {images.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              From attachments
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {images.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() =>
                    onUpdate({ coverType: 'image', coverValue: `/api/files/${a.storedName}` })
                  }
                  className="h-14 overflow-hidden rounded-sm"
                >
                  <img
                    src={withBase(`/api/files/${a.storedName}`)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {card.coverType && (
          <div className="flex gap-1.5">
            <button
              className="btn btn-subtle flex-1 py-1 text-xs"
              onClick={() =>
                onUpdate({ coverSize: card.coverSize === 'full' ? 'normal' : 'full' })
              }
            >
              {card.coverSize === 'full' ? 'Normal size' : 'Full bleed'}
            </button>
            <button
              className="btn btn-ghost py-1 text-xs"
              onClick={() => onUpdate({ coverType: null, coverValue: null })}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </Popover>
  );
}

function describeActivity(a: any) {
  const d = a.data || {};
  switch (a.type) {
    case 'card.created':
      return 'added this card';
    case 'card.moved':
      return `moved it from ${d.from} to ${d.to}`;
    case 'card.completed':
      return 'marked it complete';
    case 'card.reopened':
      return 'reopened it';
    case 'card.archived':
      return 'archived it';
    case 'card.assigned':
      return `assigned ${d.name}`;
    case 'comment.added':
      return 'commented';
    case 'attachment.added':
      return `attached ${d.filename}`;
    case 'checklist.created':
      return `added the checklist "${d.checklist}"`;
    case 'checklist.item.added':
      return `added "${d.item}" to the checklist`;
    case 'checklist.item.edited':
      return `renamed a checklist item to "${d.item}"`;
    case 'checklist.checked':
      return `ticked "${d.item}" (${d.done}/${d.total})`;
    case 'checklist.unchecked':
      return `unticked "${d.item}" (${d.done}/${d.total})`;
    case 'card.subtask.added':
      return `added the subtask "${d.title}"`;
    case 'card.parent.set':
      return `made this a subtask of "${d.parent}"`;
    case 'card.parent.cleared':
      return 'detached this from its parent';
    default:
      return a.type;
  }
}
