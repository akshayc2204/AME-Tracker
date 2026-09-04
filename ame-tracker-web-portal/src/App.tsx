import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import { getAuthToken } from './services/api';
import './styles/index.css';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
// Manual Tracking disabled for now
// import ManualTrack from './pages/ManualTrack';
import Dispatch from './pages/Dispatch';
import Reports from './pages/Reports';
import Admin from './pages/Admin';

// Layout
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getAuthToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Page wrapper
function AppLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          <TopBar title={title} subtitle={subtitle} />
          <main className="page-content">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<AppLayout title="Dashboard"><Dashboard /></AppLayout>} />
          <Route path="/projects" element={<AppLayout title="Projects"><Projects /></AppLayout>} />
          <Route path="/jobs" element={<Navigate to="/projects" replace />} />
          <Route path="/parts" element={<Navigate to="/projects" replace />} />
          {/* Manual Tracking disabled for now
          <Route path="/parts/track" element={<AppLayout title="Manual Tracking"><ManualTrack /></AppLayout>} />
          <Route path="/scan" element={<AppLayout title="Manual Tracking"><ManualTrack /></AppLayout>} />
          */}
          <Route path="/parts/track" element={<Navigate to="/dashboard" replace />} />
          <Route path="/scan" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dispatch" element={<AppLayout title="Dispatch"><Dispatch /></AppLayout>} />
          <Route path="/reports" element={<AppLayout title="Reports"><Reports /></AppLayout>} />
          <Route path="/admin" element={<AppLayout title="Admin"><Admin /></AppLayout>} />
          <Route path="/import" element={<Navigate to="/admin" replace />} />
          <Route path="/settings" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
