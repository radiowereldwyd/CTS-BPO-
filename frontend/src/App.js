import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import StatusPanel from './components/StatusPanel';
import FailedContracts from './components/FailedContracts';
import PricingTable from './components/PricingTable';
import LoginPage from './components/LoginPage';
import './App.css';

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
          <div className="header-brand">
            <span className="header-logo">CTS BPO</span>
            <span className="header-tagline">AI Platform</span>
          </div>
          <nav className="header-nav">
            <Link to="/">Dashboard</Link>
            <Link to="/status">Status</Link>
            <Link to="/failed-contracts">Failed Contracts</Link>
            <Link to="/pricing">Pricing</Link>
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

