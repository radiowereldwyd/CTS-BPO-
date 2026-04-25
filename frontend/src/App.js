import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import StatusPanel from './components/StatusPanel';
import FailedContracts from './components/FailedContracts';
import PricingTable from './components/PricingTable';
import GlobalMarkets from './components/GlobalMarkets';
import ProfitProjection from './components/ProfitProjection';
import DeploymentGuide from './components/DeploymentGuide';
import LoginPage from './components/LoginPage';
import CTSLogo from './components/CTSLogo';
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

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('cts_token');
    const storedUser = localStorage.getItem('cts_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('cts_token');
        localStorage.removeItem('cts_user');
      }
    }
  }, []);

  function handleLogin(loggedInUser, authToken) {
    setUser(loggedInUser);
    setToken(authToken);
  }

  function handleLogout() {
    localStorage.removeItem('cts_token');
    localStorage.removeItem('cts_user');
    setUser(null);
    setToken(null);
  }

  if (!user) {
    return (
      <Router>
        <div className="app">
          <Routes>
            <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
          </Routes>
        </div>
      </Router>
    );
  }

  return (
    <Router>
      <div className="app">
        <header className="app-header">
          <Link to="/" className="header-brand-link">
            <CTSLogo size="md" className="header-brand-logo" />
            <CTSLogo size="sm" className="header-brand-logo-sm" />
          </Link>
          <nav className="header-nav">
            <NavLink to="/">Dashboard</NavLink>
            <NavLink to="/status">Status</NavLink>
            <NavLink to="/failed-contracts">Failed Contracts</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/global-markets">Global Markets</NavLink>
            <NavLink to="/profit-projection">Profit Projection</NavLink>
            <NavLink to="/deployment-guide">Deployment Guide</NavLink>
          </nav>
          <div className="header-user">
            <span className="user-name">{user.name}</span>
            <span className={`user-role role-${user.role}`}>{user.role}</span>
            <button className="btn-logout" onClick={handleLogout}>Sign Out</button>
          </div>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard token={token} />} />
            <Route path="/status" element={<StatusPanel token={token} />} />
            <Route path="/failed-contracts" element={<FailedContracts token={token} />} />
            <Route path="/pricing" element={<PricingTable />} />
            <Route path="/global-markets" element={<GlobalMarkets />} />
            <Route path="/profit-projection" element={<ProfitProjection />} />
            <Route path="/deployment-guide" element={<DeploymentGuide />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <p>&copy; {new Date().getFullYear()} CTS BPO – AI Business Process Outsourcing</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;

