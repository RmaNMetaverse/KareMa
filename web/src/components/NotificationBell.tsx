import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { useApp } from '../store/app';
import { getSocket } from '../lib/socket';
import { cn, timeAgo } from '../lib/utils';
import { Avatar, Popover, Spinner } from './ui';

type Notification = {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actor?: { id: string; name: string; avatarColor: string; avatarUrl?: string | null } | null;
  board?: { id: string; title: string; color: string } | null;
  card?: { id: string; title: string } | null;
};

export function NotificationBell() {
  const { unread, setUnread } = useApp();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = await get<{ notifications: Notification[]; unread: number }>('/api/notifications');
      setItems(res.notifications);
      setUnread(res.unread);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) load();
  }, [opened]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = (payload: { notification: Notification }) => {
      if (payload?.notification) setItems((prev) => [payload.notification, ...prev].slice(0, 60));
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, []);

  const open = async (n: Notification) => {
    if (!n.isRead) {
      const res = await post<{ unread: number }>(`/api/notifications/${n.id}/read`);
      setUnread(res.unread);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    if (n.board?.id && n.card?.id) navigate(`/b/${n.board.id}?card=${n.card.id}`);
    else if (n.board?.id) navigate(`/b/${n.board.id}`);
  };

  const markAll = async () => {
    await post('/api/notifications/read-all');
    setUnread(0);
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
  };

  const clearAll = async () => {
    await del('/api/notifications');
    setUnread(0);
    setItems([]);
  };

  return (
    <Popover
      width="w-[22rem]"
      align="right"
      className="p-0 overflow-hidden"
      onOpenChange={setOpened}
      trigger={({ toggle }) => (
        <button
          className="btn btn-ghost btn-icon relative"
          onClick={toggle}
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unread > 0 && (
            <>
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />
              <span className="absolute right-1 top-1 h-2 w-2 animate-pulse-ring rounded-full bg-danger" />
            </>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between border-b border-line/70 px-3 py-2.5">
        <span className="text-sm font-semibold">
          Notifications {unread > 0 && <span className="text-muted">({unread})</span>}
        </span>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon" onClick={markAll} title="Mark all as read">
            <CheckCheck size={15} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={clearAll} title="Clear all">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="max-h-[26rem] overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-10 text-muted">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">You are all caught up.</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={cn(
                'flex w-full gap-3 border-b border-line/40 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-surface3/60',
                !n.isRead && 'bg-primary/6'
              )}
            >
              <div className="relative mt-0.5 shrink-0">
                <Avatar user={n.actor ?? { name: '?', avatarColor: '#64748b' }} size={30} />
                {!n.isRead && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug">{n.message}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  {n.board && (
                    <>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: n.board.color }}
                      />
                      <span className="truncate">{n.board.title}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{timeAgo(n.createdAt)}</span>
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </Popover>
  );
}
