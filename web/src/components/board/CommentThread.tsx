import { useRef, useState } from 'react';
import {
  Download,
  File as FileIcon,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { del, patch, post, uploadFile } from '../../lib/api';
import { useApp } from '../../store/app';
import { cn, formatBytes, renderRichText, timeAgo } from '../../lib/utils';
import { Avatar, Spinner } from '../ui';
import { MentionUser } from './MentionInput';
import { RichTextEditor } from './RichTextEditor';

export type CommentData = {
  id: string;
  body: string;
  isEdited: boolean;
  createdAt: string;
  author: MentionUser & { id: string };
  attachments: AttachmentData[];
};

export type AttachmentData = {
  id: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: string;
  url?: string | null;
  createdAt: string;
};

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon size={14} />,
  video: <FileVideo size={14} />,
  audio: <FileAudio size={14} />,
  link: <Link2 size={14} />,
  file: <FileIcon size={14} />,
};

export function attachmentHref(a: AttachmentData) {
  return a.kind === 'link' ? a.url ?? '#' : `/api/files/${a.storedName}`;
}

/* ------------------------------------------------------ attachments on a comment */

export function CommentAttachments({
  attachments,
  canRemove,
  onRemove,
}: {
  attachments: AttachmentData[];
  canRemove?: boolean;
  onRemove?: (id: string) => void;
}) {
  if (!attachments?.length) return null;

  const images = attachments.filter((a) => a.kind === 'image');
  const others = attachments.filter((a) => a.kind !== 'image');

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className={cn('grid gap-1.5', images.length === 1 ? 'max-w-xs' : 'grid-cols-2 sm:grid-cols-3')}>
          {images.map((a) => (
            <div key={a.id} className="group/att relative overflow-hidden rounded-md border border-line/60">
              <a href={attachmentHref(a)} target="_blank" rel="noreferrer">
                <img
                  src={attachmentHref(a)}
                  alt={a.filename}
                  loading="lazy"
                  className="h-28 w-full object-cover transition-transform duration-200 group-hover/att:scale-[1.03]"
                />
              </a>
              {canRemove && (
                <button
                  onClick={() => onRemove?.(a.id)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity hover:bg-danger group-hover/att:opacity-100"
                  aria-label={`Remove ${a.filename}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {others.map((a) =>
        a.kind === 'video' ? (
          <div key={a.id} className="relative max-w-sm overflow-hidden rounded-md border border-line/60">
            <video src={attachmentHref(a)} controls className="w-full bg-black" />
            {canRemove && (
              <button
                onClick={() => onRemove?.(a.id)}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white hover:bg-danger"
                aria-label={`Remove ${a.filename}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : a.kind === 'audio' ? (
          <div key={a.id} className="flex max-w-sm items-center gap-2 rounded-md border border-line/60 p-1.5">
            <audio src={attachmentHref(a)} controls className="h-8 flex-1" />
            {canRemove && (
              <button onClick={() => onRemove?.(a.id)} className="text-muted hover:text-danger">
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <a
            key={a.id}
            href={attachmentHref(a)}
            target="_blank"
            rel="noreferrer"
            className="group/att flex max-w-sm items-center gap-2.5 rounded-md border border-line/60 bg-surface2/50 px-2.5 py-2 transition-colors hover:border-primary/40"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface3/70 text-muted">
              {KIND_ICON[a.kind] ?? KIND_ICON.file}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{a.filename}</span>
              <span className="block text-[11px] text-muted">
                {a.kind === 'link' ? 'Link' : formatBytes(a.size)}
              </span>
            </span>
            {canRemove ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onRemove?.(a.id);
                }}
                className="shrink-0 text-muted hover:text-danger"
                aria-label={`Remove ${a.filename}`}
              >
                <X size={14} />
              </button>
            ) : (
              <Download size={14} className="shrink-0 text-muted opacity-0 group-hover/att:opacity-100" />
            )}
          </a>
        )
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- composer */

export function CommentComposer({
  cardId,
  people,
  onPosted,
}: {
  cardId: string;
  people: MentionUser[];
  onPosted: (comment: CommentData) => void;
}) {
  const { user, toast } = useApp();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    setPending((prev) => [...prev, ...incoming].slice(0, 10));
  };

  const submit = async () => {
    const text = body.trim();
    if (!text && pending.length === 0) return;
    setBusy(true);
    try {
      // an attachment-only comment still needs a body the server will accept
      const res = await post<{ comment: CommentData }>('/api/comments', {
        cardId,
        body: text || (pending.length === 1 ? 'Attached a file' : `Attached ${pending.length} files`),
      });

      const uploaded: AttachmentData[] = [];
      for (const file of pending) {
        try {
          const up = await uploadFile(
            cardId,
            file,
            (pct) => setProgress((p) => ({ ...p, [file.name]: pct })),
            res.comment.id
          );
          uploaded.push(up.attachment);
        } catch (err: any) {
          toast({ title: `Could not attach ${file.name}`, description: err.message, tone: 'error' });
        }
      }

      onPosted({ ...res.comment, attachments: uploaded });
      setBody('');
      setPending([]);
      setProgress({});
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2.5">
      <Avatar user={user} size={30} />
      <div
        className={cn(
          'min-w-0 flex-1 rounded-lg transition-colors',
          dragging && 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        <RichTextEditor
          value={body}
          onChange={setBody}
          people={people}
          rows={3}
          compact
          placeholder="Write a comment. Type @ to mention someone, or drop files here."
          onSubmit={submit}
        />

        {pending.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pending.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 rounded-sm bg-surface2 px-2 py-1 text-[11px]"
              >
                {f.type.startsWith('image/') ? <ImageIcon size={12} /> : <Paperclip size={12} />}
                <span className="max-w-[10rem] truncate">{f.name}</span>
                <span className="text-muted">{formatBytes(f.size)}</span>
                {busy && progress[f.name] !== undefined && (
                  <span className="text-primary">{progress[f.name]}%</span>
                )}
                {!busy && (
                  <button
                    onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted hover:text-danger"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <button
            className="btn btn-primary py-1 text-xs"
            onClick={submit}
            disabled={busy || (!body.trim() && pending.length === 0)}
          >
            {busy ? <Spinner size={13} /> : <Send size={13} />}
            Comment
          </button>
          <button
            className="btn btn-ghost py-1 text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Attach files to this comment"
          >
            <Paperclip size={14} />
            Attach
          </button>
          <span className="ml-auto hidden text-[11px] text-muted sm:block">Ctrl + Enter to send</span>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- one comment */

export function CommentItem({
  comment,
  cardId,
  people,
  canManage,
  onChanged,
}: {
  comment: CommentData;
  cardId: string;
  people: MentionUser[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(cardId, file, undefined, comment.id);
      }
      onChanged();
    } catch (err: any) {
      toast({ title: err.message, tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex gap-2.5">
      <Avatar user={comment.author} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{comment.author.name}</span>
          <span className="text-[11px] text-muted">
            {timeAgo(comment.createdAt)}
            {comment.isEdited && ' · edited'}
          </span>
        </div>

        {editing ? (
          <div className="mt-1.5">
            <RichTextEditor value={draft} onChange={setDraft} people={people} rows={3} compact autoFocus />
            <div className="mt-1.5 flex gap-1.5">
              <button
                className="btn btn-primary py-1 text-xs"
                disabled={!draft.trim()}
                onClick={async () => {
                  try {
                    await patch(`/api/comments/${comment.id}`, { body: draft.trim() });
                    setEditing(false);
                    onChanged();
                  } catch (err: any) {
                    toast({ title: err.message, tone: 'error' });
                  }
                }}
              >
                Save
              </button>
              <button
                className="btn btn-ghost py-1 text-xs"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="prose-mini mt-1 rounded-md bg-surface2/60 px-3 py-2 text-[13px] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderRichText(comment.body) }}
            />

            <CommentAttachments
              attachments={comment.attachments || []}
              canRemove={canManage}
              onRemove={async (id) => {
                await del(`/api/attachments/${id}`);
                onChanged();
              }}
            />

            {canManage && (
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
                <button className="hover:text-ink" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button
                  className="flex items-center gap-1 hover:text-ink"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Spinner size={10} /> : <Paperclip size={11} />}
                  Attach
                </button>
                <button
                  className="hover:text-danger"
                  onClick={async () => {
                    await del(`/api/comments/${comment.id}`);
                    onChanged();
                  }}
                >
                  Delete
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
