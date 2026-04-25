import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import StatusPanel from './components/StatusPanel';
import FailedContracts from './components/FailedContracts';
import PricingTable from './components/PricingTable';

function App() {
  return (
    <Router>
      <div className="app">
        <header className="app-header">
          <h1>CTS BPO</h1>
          <nav>
            <a href="/">Dashboard</a>
            <a href="/status">Status</a>
            <a href="/failed-contracts">Failed Contracts</a>
            <a href="/pricing">Pricing</a>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/status" element={<StatusPanel />} />
            <Route path="/failed-contracts" element={<FailedContracts />} />
            <Route path="/pricing" element={<PricingTable />} />
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
