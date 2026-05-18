import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import OperationsDashboard from './components/OperationsDashboard';
import Dashboard from './components/Dashboard';
import StatusPanel from './components/StatusPanel';
import FailedContracts from './components/FailedContracts';
import EmailTemplates from './components/EmailTemplates';
import LoginPage from './components/LoginPage';
import Payments from './components/Payments';
import JobSearch from './components/JobSearch';
import AIServices from './components/AIServices';
import SubcontractorHub from './components/SubcontractorHub';
import AIAgentDashboard from './components/AIAgentDashboard';
import LandingPage from './components/LandingPage';
import ApplyPage from './components/ApplyPage';
import SubcontractorLogin from './components/SubcontractorLogin';
import SubcontractorPortal from './components/SubcontractorPortal';
import CTSLogo from './components/CTSLogo';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ClientPortal from './components/ClientPortal';
import TargetedScraper from './components/TargetedScraper';
import PricingTable from './components/PricingTable';
import PriceNegotiator from './components/PriceNegotiator';
import AIControlRoom from './components/AIControlRoom';
import JobQueue from './components/JobQueue';
import CallCentre from './components/CallCentre';
import CallRoom from './components/CallRoom';
import LinkedInOutreach from './components/LinkedInOutreach';
import AdCreatives from './components/AdCreatives';
import FreelancerInbox from './components/FreelancerInbox';
import './App.css';

const NAV_ITEMS = [
  { to: '/operations',       icon: '📊', label: 'Operations'  },
  { to: '/job-search',       icon: '🎯', label: 'Leads'       },
  { to: '/job-queue',        icon: '💼', label: 'Job Queue'   },
  { to: '/subcontractors',   icon: '🤝', label: 'Team'        },
  { to: '/payments',         icon: '💰', label: 'Finance'     },
  { to: '/email-templates',  icon: '📧', label: 'Outreach'    },
  { to: '/freelancer-inbox', icon: '💬', label: 'Freelancer'  },
  { to: '/status',           icon: '⚙️',  label: 'System'     },
];

function Sidebar({ user, onLogout, open, onClose }) {
  const location = useLocation();
  return (
    <>
      {/* Overlay for mobile */}
      {open && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <Link to="/operations" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
            {/* Compass icon */}
            <div className="sidebar-compass">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="38" height="38">
                <circle cx="24" cy="24" r="22" stroke="#00c8ff" strokeWidth="2" fill="rgba(0,200,255,0.07)" />
                <circle cx="24" cy="24" r="3" fill="#00c8ff" />
                {/* N tick */}
                <line x1="24" y1="4" x2="24" y2="9" stroke="#00c8ff" strokeWidth="2" strokeLinecap="round"/>
                {/* S tick */}
                <line x1="24" y1="39" x2="24" y2="44" stroke="#334155" strokeWidth="2" strokeLinecap="round"/>
                {/* E tick */}
                <line x1="39" y1="24" x2="44" y2="24" stroke="#334155" strokeWidth="2" strokeLinecap="round"/>
                {/* W tick */}
                <line x1="4" y1="24" x2="9" y2="24" stroke="#334155" strokeWidth="2" strokeLinecap="round"/>
                {/* North needle (cyan) */}
                <polygon points="24,8 20.5,24 24,21 27.5,24" fill="#00c8ff" />
                {/* South needle (red) */}
                <polygon points="24,40 20.5,24 24,27 27.5,24" fill="#ef4444" opacity="0.85" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>CTS BPO</div>
              <div style={{ fontSize: 9, color: '#00c8ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>AI Platform</div>
            </div>
          </Link>
        </div>

        {/* Nav label */}
        <div className="sidebar-section-label">Main Menu</div>

        {/* Nav items */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, icon, label }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={onClose}
                className={`sidebar-link${active ? ' sidebar-link-active' : ''}`}
              >
                <span className="sidebar-link-icon">{icon}</span>
                <span className="sidebar-link-label">{label}</span>
                {active && <span className="sidebar-link-pip" />}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Public site link */}
        <div className="sidebar-section-label">Account</div>
        <Link to="/" className="sidebar-link" style={{ marginBottom: 4 }}>
          <span className="sidebar-link-icon">🌐</span>
          <span className="sidebar-link-label">Public Site</span>
        </Link>

        {/* User block */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {(user.name || 'A')[0].toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className={`sidebar-user-role role-${user.role}`}>{user.role}</div>
          </div>
          <button className="sidebar-logout" onClick={onLogout} title="Sign out">
            ⏏
          </button>
        </div>
      </aside>
    </>
  );
}

function AdminShell({ user, token, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
          <span /><span /><span />
        </button>
        <CTSLogo size="sm" />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>CTS BPO</div>
      </div>

      <Sidebar user={user} onLogout={onLogout} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-content">
        <main className="app-main">
          <Routes>
            {/* ── Primary nav ── */}
            <Route path="/operations"       element={<OperationsDashboard token={token} />} />
            <Route path="/job-search"       element={<JobSearch />} />
            <Route path="/job-queue"        element={<JobQueue token={token} />} />
            <Route path="/subcontractors"   element={<SubcontractorHub token={token} />} />
            <Route path="/payments"         element={<Payments />} />
            <Route path="/email-templates"  element={<EmailTemplates />} />
            <Route path="/freelancer-inbox" element={<FreelancerInbox token={token} />} />
            <Route path="/status"           element={<StatusPanel token={token} />} />

            {/* ── Legacy / direct-access routes (not in main nav) ── */}
            <Route path="/dashboard"         element={<Dashboard token={token} />} />
            <Route path="/ai-agent"          element={<AIAgentDashboard token={token} />} />
            <Route path="/control-room"      element={<AIControlRoom token={token} />} />
            <Route path="/analytics"         element={<AnalyticsDashboard token={token} />} />
            <Route path="/targeted-scraper"  element={<TargetedScraper token={token} />} />
            <Route path="/ai-services"       element={<AIServices />} />
            <Route path="/failed-contracts"  element={<FailedContracts token={token} />} />
            <Route path="/price-negotiator"  element={<PriceNegotiator token={token} />} />
            <Route path="/call-centre"       element={<CallCentre token={token} user={user} />} />
            <Route path="/linkedin-outreach" element={<LinkedInOutreach token={token} user={user} />} />
            <Route path="/ad-creatives"      element={<AdCreatives />} />

            {/* ── Redirects ── */}
            <Route path="/login" element={<Navigate to="/operations" replace />} />
            <Route path="*"      element={<Navigate to="/operations" replace />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <p>&copy; {new Date().getFullYear()} CTS BPO – AI Business Process Outsourcing</p>
        </footer>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser]         = useState(null);
  const [token, setToken]       = useState(null);
  const [subUser, setSubUser]   = useState(null);
  const [subToken, setSubToken] = useState(null);
  const logoutRef = useRef(null);

  // Global 401 interceptor — auto-logout on expired/invalid token
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err?.response?.status === 401 && logoutRef.current) {
          logoutRef.current();
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    // ── Barcode / token login via URL fragment ────────────────────────────────
    // The backend redirects to /operations#token=…&user=… after a successful
    // barcode scan.  We intercept the fragment here before React Router renders.
    const hash = window.location.hash;
    if (hash && hash.includes('token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const jwtToken = params.get('token');
      const userJson = params.get('user');
      if (jwtToken && userJson) {
        try {
          const parsedUser = JSON.parse(decodeURIComponent(userJson));
          localStorage.setItem('cts_token', jwtToken);
          localStorage.setItem('cts_user', JSON.stringify(parsedUser));
          setToken(jwtToken);
          setUser(parsedUser);
          // Remove the fragment from the URL so it doesn't persist
          window.history.replaceState(null, '', window.location.pathname);
          return; // Skip reading stale localStorage below
        } catch { /* fall through to localStorage */ }
      }
    }

    // Admin session
    const storedToken = localStorage.getItem('cts_token');
    const storedUser  = localStorage.getItem('cts_user');
    if (storedToken && storedUser) {
      try { setToken(storedToken); setUser(JSON.parse(storedUser)); } catch {
        localStorage.removeItem('cts_token');
        localStorage.removeItem('cts_user');
      }
    }
    // Subcontractor session
    const st = localStorage.getItem('cts_sub_token');
    const su = localStorage.getItem('cts_sub_user');
    if (st && su) {
      try { setSubToken(st); setSubUser(JSON.parse(su)); } catch {
        localStorage.removeItem('cts_sub_token');
        localStorage.removeItem('cts_sub_user');
      }
    }
  }, []);

  function handleAdminLogin(loggedInUser, authToken) {
    setUser(loggedInUser);
    setToken(authToken);
  }

  function handleAdminLogout() {
    localStorage.removeItem('cts_token');
    localStorage.removeItem('cts_user');
    setUser(null);
    setToken(null);
  }

  // Keep logoutRef current so the axios interceptor can always call the latest version
  logoutRef.current = handleAdminLogout;

  function handleSubLogin(loggedInUser, authToken) {
    setSubUser(loggedInUser);
    setSubToken(authToken);
    localStorage.setItem('cts_sub_token', authToken);
    localStorage.setItem('cts_sub_user', JSON.stringify(loggedInUser));
  }

  function handleSubLogout() {
    localStorage.removeItem('cts_sub_token');
    localStorage.removeItem('cts_sub_user');
    setSubUser(null);
    setSubToken(null);
  }

  return (
    <Router>
      <Routes>
        {/* Always public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingTable />} />
        <Route path="/apply" element={<ApplyPage />} />

        {/* Client portal — public, accessed via token link from delivery email */}
        <Route path="/client/portal/:token" element={<ClientPortal />} />

        {/* Call centre room — public, no login required for clients */}
        <Route path="/call/room/:roomId" element={<CallRoom />} />

        {/* Subcontractor login — always public */}
        <Route path="/subcontractor/login" element={
          subUser
            ? <Navigate to="/subcontractor/portal" replace />
            : <SubcontractorLogin onLogin={handleSubLogin} />
        } />

        {/* Subcontractor set-password — always public (accessed via email link) */}
        <Route path="/subcontractor/set-password" element={
          <SubcontractorLogin onLogin={handleSubLogin} />
        } />

        {/* Subcontractor portal — requires subcontractor login */}
        <Route path="/subcontractor/portal" element={
          subUser
            ? <SubcontractorPortal user={subUser} token={subToken} onLogout={handleSubLogout} />
            : <Navigate to="/subcontractor/login" replace />
        } />

        {/* Admin login page */}
        <Route path="/login" element={
          user
            ? <Navigate to="/dashboard" replace />
            : <div className="app"><Routes><Route path="*" element={<LoginPage onLogin={handleAdminLogin} />} /></Routes></div>
        } />

        {/* All admin routes — require admin login, subcontractors cannot access */}
        <Route path="/*" element={
          user
            ? <AdminShell user={user} token={token} onLogout={handleAdminLogout} />
            : <div className="app"><Routes><Route path="*" element={<LoginPage onLogin={handleAdminLogin} />} /></Routes></div>
        } />
      </Routes>
    </Router>
  );
}

export default App;
