import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  CircleUser,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Shield,
  SquareKanban,
  Star,
} from 'lucide-react';
import { get } from '../lib/api';
import { useApp } from '../store/app';
import { getSocket } from '../lib/socket';
import { cn } from '../lib/utils';
import { Avatar, MenuItem, Popover } from './ui';
import { NotificationBell } from './NotificationBell';
import { ThemeMenu } from './ThemeMenu';
import { SearchPalette } from './SearchPalette';
import { BoardCreateModal } from './BoardCreateModal';
import { ForcePasswordChange } from './ForcePasswordChange';

type BoardSummary = {
  id: string;
  title: string;
  color: string;
  icon?: string | null;
  starred: boolean;
};

export function AppShell() {
  const { user, prefs, setPrefs, logout, boardsStamp } = useApp();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = prefs.sidebarCollapsed;
  const can = (key: string) => !!user?.permissions?.[key];

  const loadBoards = () =>
    get<{ boards: BoardSummary[] }>('/api/boards')
      .then((r) => setBoards(r.boards))
      .catch(() => undefined);

  useEffect(() => {
    loadBoards();
  }, [location.pathname, boardsStamp]);

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // keep the socket alive for the whole session
  useEffect(() => {
    if (user) getSocket();
  }, [user]);

  const starred = boards.filter((b) => b.starred);

  const navItems = [
    { to: '/', label: 'Boards', icon: <LayoutDashboard size={18} />, end: true },
    { to: '/my-work', label: 'My work', icon: <ListChecks size={18} /> },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="app-aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* ------------------------------------------------------------ sidebar */}
        <aside
          className={cn(
            'glass fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
            collapsed ? 'lg:w-[68px]' : 'lg:w-64',
            'w-64',
            mobileNav ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-14 items-center gap-2.5 px-3">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-secondary text-sm font-black text-primary-ink shadow-glow">
                K
              </span>
              {!collapsed && (
                <span className="truncate text-[15px] font-bold tracking-tight">KareMa</span>
              )}
            </Link>
            <button
              className="btn btn-ghost btn-icon ml-auto hidden lg:inline-flex"
              onClick={() => setPrefs({ sidebarCollapsed: !collapsed })}
              aria-label="Toggle sidebar"
            >
              <ChevronLeft
                size={16}
                className={cn('transition-transform', collapsed && 'rotate-180')}
              />
            </button>
          </div>

          <div className="px-3 pb-2">
            <button
              className="btn btn-primary w-full"
              onClick={() => setCreateOpen(true)}
              title="New board"
            >
              <Plus size={16} />
              {!collapsed && <span>New board</span>}
            </button>
          </div>

          <nav className="flex flex-col gap-0.5 px-2 pt-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/14 text-primary'
                      : 'text-muted hover:bg-surface3/60 hover:text-ink'
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface3/60 hover:text-ink"
              title={collapsed ? 'Search' : undefined}
            >
              <Search size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search</span>
                  <kbd className="rounded-xs border border-line px-1 py-0.5 text-[10px]">⌘K</kbd>
                </>
              )}
            </button>
          </nav>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {starred.length > 0 && (
              <SidebarSection title="Starred" collapsed={collapsed}>
                {starred.map((b) => (
                  <BoardLink key={b.id} board={b} collapsed={collapsed} starred />
                ))}
              </SidebarSection>
            )}
            <SidebarSection title="All boards" collapsed={collapsed}>
              {boards.length === 0 ? (
                !collapsed && (
                  <p className="px-2.5 py-2 text-xs text-muted">No boards yet.</p>
                )
              ) : (
                boards.map((b) => <BoardLink key={b.id} board={b} collapsed={collapsed} />)
              )}
            </SidebarSection>
          </div>

          <div className="border-t border-line/60 p-2">
            {can('admin.access') && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/14 text-primary'
                      : 'text-muted hover:bg-surface3/60 hover:text-ink'
                  )
                }
                title={collapsed ? 'Admin' : undefined}
              >
                <Shield size={18} className="shrink-0" />
                {!collapsed && <span>Admin panel</span>}
              </NavLink>
            )}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/14 text-primary'
                    : 'text-muted hover:bg-surface3/60 hover:text-ink'
                )
              }
              title={collapsed ? 'Settings' : undefined}
            >
              <Settings size={18} className="shrink-0" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
          </div>
        </aside>

        {mobileNav && (
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}

        {/* -------------------------------------------------------------- main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 sm:px-4">
            <button
              className="btn btn-ghost btn-icon lg:hidden"
              onClick={() => setMobileNav(true)}
              aria-label="Menu"
            >
              <Menu size={18} />
            </button>

            <button
              onClick={() => setSearchOpen(true)}
              className="hidden max-w-xs flex-1 items-center gap-2 rounded-md border border-line bg-surface2/60 px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary/40 hover:text-ink sm:flex"
            >
              <Search size={15} />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="rounded-xs border border-line px-1 py-0.5 text-[10px]">⌘K</kbd>
            </button>

            <div className="min-w-0 flex-1" />

            <div className="flex items-center gap-0.5">
              <ThemeMenu />
              <NotificationBell />
              <Popover
                align="right"
                width="w-60"
                trigger={({ toggle }) => (
                  <button onClick={toggle} className="ml-1 rounded-full" aria-label="Account">
                    <Avatar user={user} size={32} ring />
                  </button>
                )}
              >
                {(close) => (
                  <div>
                    <div className="flex items-center gap-3 px-2 py-2">
                      <Avatar user={user} size={38} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{user?.name}</p>
                        <p className="truncate text-xs text-muted">{user?.email}</p>
                      </div>
                    </div>
                    <div className="divider my-1.5" />
                    <MenuItem
                      icon={<CircleUser size={15} />}
                      onClick={() => {
                        close();
                        navigate('/settings/profile');
                      }}
                    >
                      Profile
                    </MenuItem>
                    <MenuItem
                      icon={<Settings size={15} />}
                      onClick={() => {
                        close();
                        navigate('/settings/appearance');
                      }}
                    >
                      Appearance
                    </MenuItem>
                    {can('admin.access') && (
                      <MenuItem
                        icon={<Shield size={15} />}
                        onClick={() => {
                          close();
                          navigate('/admin');
                        }}
                      >
                        Admin panel
                      </MenuItem>
                    )}
                    <div className="divider my-1.5" />
                    <MenuItem
                      icon={<LogOut size={15} />}
                      danger
                      onClick={async () => {
                        close();
                        await logout();
                        navigate('/login');
                      }}
                    >
                      Sign out
                    </MenuItem>
                  </div>
                )}
              </Popover>
            </div>
          </header>

          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <ForcePasswordChange />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <BoardCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(board) => {
          loadBoards();
          navigate(`/b/${board.id}`);
        }}
      />
    </div>
  );
}

function SidebarSection({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      {!collapsed && (
        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </p>
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function BoardLink({
  board,
  collapsed,
  starred,
}: {
  board: BoardSummary;
  collapsed: boolean;
  starred?: boolean;
}) {
  return (
    <NavLink
      to={`/b/${board.id}`}
      title={collapsed ? board.title : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
          isActive ? 'bg-primary/12 text-ink font-medium' : 'text-muted hover:bg-surface3/60 hover:text-ink'
        )
      }
    >
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-xs text-[11px]"
        style={{ background: `${board.color}26`, color: board.color }}
      >
        {board.icon || <SquareKanban size={12} />}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{board.title}</span>
          {starred && <Star size={12} className="shrink-0 fill-warning text-warning" />}
        </>
      )}
    </NavLink>
  );
}
