import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import StatusPanel from './components/StatusPanel';
import FailedContracts from './components/FailedContracts';
import PricingTable from './components/PricingTable';
import GlobalMarkets from './components/GlobalMarkets';
import ProfitProjection from './components/ProfitProjection';
import DeploymentGuide from './components/DeploymentGuide';
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
import './App.css';

function NavLink({ to, children }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className={isActive ? 'active' : ''}>
      {children}
    </Link>
  );
}

function AdminShell({ user, token, onLogout }) {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/dashboard" className="header-brand-link">
          <CTSLogo size="md" className="header-brand-logo" />
          <CTSLogo size="sm" className="header-brand-logo-sm" />
        </Link>
        <nav className="header-nav">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/status">Status</NavLink>
          <NavLink to="/failed-contracts">Failed Contracts</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/global-markets">Global Markets</NavLink>
          <NavLink to="/profit-projection">Profit Projection</NavLink>
          <NavLink to="/deployment-guide">Deployment Guide</NavLink>
          <NavLink to="/email-templates">Email Templates</NavLink>
          <NavLink to="/payments">Payments</NavLink>
          <NavLink to="/job-search">🌐 Job Search</NavLink>
          <NavLink to="/ai-services">🤖 AI Services</NavLink>
          <NavLink to="/subcontractors">🤝 Subcontractors</NavLink>
          <NavLink to="/ai-agent">🧠 AI Agent</NavLink>
          <NavLink to="/analytics">📊 Analytics</NavLink>
        </nav>
        <div className="header-user">
          <Link to="/" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none', marginRight: 12 }}>← Public Site</Link>
          <span className="user-name">{user.name}</span>
          <span className={`user-role role-${user.role}`}>{user.role}</span>
          <button className="btn-logout" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/dashboard" element={<Dashboard token={token} />} />
          <Route path="/status" element={<StatusPanel token={token} />} />
          <Route path="/failed-contracts" element={<FailedContracts token={token} />} />
          <Route path="/pricing" element={<PricingTable />} />
          <Route path="/global-markets" element={<GlobalMarkets />} />
          <Route path="/profit-projection" element={<ProfitProjection token={token} />} />
          <Route path="/deployment-guide" element={<DeploymentGuide />} />
          <Route path="/email-templates" element={<EmailTemplates />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/job-search" element={<JobSearch />} />
          <Route path="/ai-services" element={<AIServices />} />
          <Route path="/subcontractors" element={<SubcontractorHub token={token} />} />
          <Route path="/ai-agent" element={<AIAgentDashboard token={token} />} />
          <Route path="/analytics" element={<AnalyticsDashboard token={token} />} />
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} CTS BPO – AI Business Process Outsourcing</p>
      </footer>
    </div>
  );
}

function App() {
  const [user, setUser]         = useState(null);
  const [token, setToken]       = useState(null);
  const [subUser, setSubUser]   = useState(null);
  const [subToken, setSubToken] = useState(null);

  useEffect(() => {
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
        <Route path="/apply" element={<ApplyPage />} />

        {/* Client portal — public, accessed via token link from delivery email */}
        <Route path="/client/portal/:token" element={<ClientPortal />} />

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
