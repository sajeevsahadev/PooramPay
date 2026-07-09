import { Route, Routes } from 'react-router-dom';
import { useApp } from './state/AppContext';
import { Spinner } from './components/ui';
import Shell from './components/Shell';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import NoProgram from './pages/NoProgram';
import Dashboard from './pages/Dashboard';
import Collect from './pages/Collect';
import CollectHouse from './pages/CollectHouse';
import CollectWeekly from './pages/CollectWeekly';
import CollectOther from './pages/CollectOther';
import Coupons from './pages/Coupons';
import Expenses from './pages/Expenses';
import Tasks from './pages/Tasks';
import More from './pages/More';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Setup from './pages/Setup';
import Members from './pages/Members';
import Areas from './pages/Areas';
import Budget from './pages/Budget';
import AuditLog from './pages/AuditLog';
import DeletedTx from './pages/DeletedTx';
import AdminConsole from './pages/AdminConsole';
import Privacy from './pages/Privacy';

export default function App() {
  const { session, profile, loading, memberships, isPadmin } = useApp();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (!session) return (
    <Routes>
      <Route path="/privacy" element={<div className="p-4 min-h-screen"><Privacy /></div>} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
  if (!profile) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
  if (!profile.phone) return <Onboarding />;

  const hasAccess = memberships.length > 0 || isPadmin;

  if (!hasAccess) {
    return (
      <Routes>
        <Route path="/setup" element={<div className="p-4 max-w-3xl mx-auto"><Setup /></div>} />
        <Route path="/privacy" element={<div className="p-4"><Privacy /></div>} />
        <Route path="*" element={<NoProgram />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="/collect" element={<Collect />} />
        <Route path="/collect/house" element={<CollectHouse />} />
        <Route path="/collect/weekly" element={<CollectWeekly />} />
        <Route path="/collect/other" element={<CollectOther />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/more" element={<More />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/members" element={<Members />} />
        <Route path="/areas" element={<Areas />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/deleted" element={<DeletedTx />} />
        <Route path="/admin" element={<AdminConsole />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
