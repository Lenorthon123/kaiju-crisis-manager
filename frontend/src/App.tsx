import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { QuarterDashboard } from './pages/QuarterDashboard';
import { LogisticsDashboard } from './pages/LogisticsDashboard';
import { CityDashboard } from './pages/CityDashboard';
import { CalendarPage } from './pages/CalendarPage';

// Where each role lands after signing in.
const HOME: Record<string, string> = {
  QC: '/quarter',
  LC: '/logistics',
  CD: '/city',
};

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
        Restoring session…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const home = HOME[user.role] ?? '/quarter';

  return (
    <Routes>
      <Route element={<AppShell />}>
        {user.role === 'QC' && <Route path="/quarter" element={<QuarterDashboard />} />}
        {user.role === 'LC' && <Route path="/logistics" element={<LogisticsDashboard />} />}
        {user.role === 'CD' && <Route path="/city" element={<CityDashboard />} />}
        <Route path="/calendar" element={<CalendarPage />} />
      </Route>
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
