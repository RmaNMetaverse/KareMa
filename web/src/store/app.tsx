import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, get, post, put, setToken } from '../lib/api';
import { closeSocket, getSocket, refreshSocketAuth } from '../lib/socket';
import {
  applyPrefs,
  DEFAULT_PREFS,
  loadLocalPrefs,
  Prefs,
  resolveMode,
  saveLocalPrefs,
} from '../lib/theme';

export type Role = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  /** Legacy tier, kept for compatibility — prefer `permissions`. */
  role: 'ADMIN' | 'MEMBER' | 'GUEST';
  roleRef?: Role | null;
  permissions?: Record<string, boolean>;
  avatarColor: string;
  avatarUrl?: string | null;
  title?: string | null;
  isActive?: boolean;
  prefs?: any;
  mustChangePw?: boolean;
};

export type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: 'default' | 'success' | 'error' | 'info';
};

export type ToastInput = Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] };

type AppState = {
  user: User | null;
  loading: boolean;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  resetPrefs: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  toasts: Toast[];
  toast: (t: ToastInput | string) => void;
  dismissToast: (id: string) => void;
  unread: number;
  setUnread: (n: number) => void;
  /** Bumped whenever a board is created, renamed or deleted. */
  boardsStamp: number;
  /** Ask every board list on screen to reload. */
  refreshBoards: () => void;
};

const Ctx = createContext<AppState | null>(null);

let toastSeq = 0;
/**
 * crypto.randomUUID() only exists in a secure context. KareMa is commonly served
 * over plain http on a LAN address, where it is undefined and throws -- which used
 * to take down whatever called toast(), leaving modals open on a successful save.
 * These ids only need to be unique within one tab.
 */
function nextToastId() {
  toastSeq += 1;
  return `t${Date.now().toString(36)}-${toastSeq.toString(36)}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefsState] = useState<Prefs>(() => loadLocalPrefs());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unread, setUnread] = useState(0);
  const [boardsStamp, setBoardsStamp] = useState(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();

  // paint the theme as early as possible
  useEffect(() => {
    applyPrefs(prefs);
    saveLocalPrefs(prefs);
  }, [prefs]);

  // follow the OS when the mode is "system"
  useEffect(() => {
    if (prefs.mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyPrefs(prefs);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [prefs]);

  const setPrefs = useCallback(
    (patch: Partial<Prefs>) => {
      setPrefsState((prev) => {
        const next = { ...prev, ...patch };
        // push to the server, debounced, so preferences follow the account
        clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => {
          put('/api/auth/prefs', { prefs: next }).catch(() => undefined);
        }, 700);
        return next;
      });
    },
    []
  );

  const resetPrefs = useCallback(() => setPrefs(DEFAULT_PREFS), [setPrefs]);

  const toast = useCallback((t: ToastInput | string) => {
    const item: Toast =
      typeof t === 'string'
        ? { id: nextToastId(), title: t, tone: 'default' }
        : { tone: 'default', ...t, id: nextToastId() };
    setToasts((prev) => [...prev.slice(-3), item]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== item.id)), 4200);
  }, []);

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  const refreshUser = useCallback(async () => {
    const { user: me } = await get<{ user: User }>('/api/auth/me');
    setUser(me);
    if (me?.prefs && Object.keys(me.prefs).length) {
      const merged = { ...DEFAULT_PREFS, ...me.prefs };
      setPrefsState(merged);
      applyPrefs(merged);
      saveLocalPrefs(merged);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshUser();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshUser]);

  // live notification badge
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onNotification = (payload: { unread: number }) => setUnread(payload.unread);
    socket.on('notification:new', onNotification);
    get<{ unread: number }>('/api/notifications?unread=true')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
    return () => {
      socket.off('notification:new', onNotification);
    };
  }, [user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(res.token);
      refreshSocketAuth();
      setUser(res.user);
      if (res.user.prefs && Object.keys(res.user.prefs).length) {
        const merged = { ...DEFAULT_PREFS, ...res.user.prefs };
        setPrefsState(merged);
        applyPrefs(merged);
        saveLocalPrefs(merged);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await post('/api/auth/logout').catch(() => undefined);
    setToken(null);
    closeSocket();
    setUser(null);
  }, []);

  const refreshBoards = useCallback(() => setBoardsStamp((n) => n + 1), []);

  const value = useMemo<AppState>(
    () => ({
      user,
      loading,
      prefs,
      setPrefs,
      resetPrefs,
      login,
      logout,
      refreshUser,
      toasts,
      toast,
      dismissToast,
      unread,
      setUnread,
      boardsStamp,
      refreshBoards,
    }),
    [user, loading, prefs, setPrefs, resetPrefs, login, logout, refreshUser, toasts, toast, dismissToast, unread, boardsStamp, refreshBoards]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export { resolveMode };
