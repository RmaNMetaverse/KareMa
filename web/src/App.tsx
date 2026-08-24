import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './store/app';
import { AppShell } from './components/AppShell';
import { Toaster } from './components/Toaster';
import { Spinner } from './components/ui';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { BoardPage } from './pages/BoardPage';
import { MyWork } from './pages/MyWork';
import { SettingsPage } from './pages/Settings';
import { AdminPage } from './pages/Admin';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useApp();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={26} />
          <p className="text-sm">Loading KareMa...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  if (user && !user.permissions?.['admin.access']) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useApp();

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={loading ? null : user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-work" element={<MyWork />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:tab" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={
              <AdminOnly>
                <AdminPage />
              </AdminOnly>
            }
          />
          <Route
            path="/admin/:tab"
            element={
              <AdminOnly>
                <AdminPage />
              </AdminOnly>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
