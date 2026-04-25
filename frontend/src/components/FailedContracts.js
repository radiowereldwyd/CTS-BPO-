import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const PLACEHOLDER_FAILURES = [
  {
    id: 1,
    contractId: 'C-1042',
    clientName: 'Acme Corp',
    failureReason: 'Subcontractor missed deadline',
    assignedTo: 'Sub B',
    failedAt: '2026-04-24T10:30:00Z',
    recoveryAction: 'Re-assigned to Sub A',
    status: 'resolved',
  },
  {
    id: 2,
    contractId: 'C-1051',
    clientName: 'Global Trade Ltd',
    failureReason: 'Payment gateway timeout',
    assignedTo: 'Internal',
    failedAt: '2026-04-24T14:15:00Z',
    recoveryAction: 'Payment retry scheduled',
    status: 'in_recovery',
  },
];

function FailedContracts() {
  const [failures, setFailures] = useState(PLACEHOLDER_FAILURES);

  useEffect(() => {
    fetchFailures();
    const interval = setInterval(fetchFailures, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchFailures() {
    try {
      const res = await axios.get(`${API_BASE}/api/contracts/failed`);
      setFailures(res.data);
    } catch {
      setFailures(PLACEHOLDER_FAILURES);
    }
  }

  function statusBadge(status) {
    const labels = { failed: '🔴 Failed', in_recovery: '🟡 In Recovery', resolved: '🟢 Resolved' };
    return <span>{labels[status] || status}</span>;
  }

  return (
    <div className="failed-contracts">
      <h2>Failed Contracts</h2>
      {failures.length === 0 ? (
        <p>No failed contracts. All systems operating normally.</p>
      ) : (
        <table className="failures-table">
          <thead>
            <tr>
              <th>Contract ID</th>
              <th>Client</th>
              <th>Failure Reason</th>
              <th>Assigned To</th>
              <th>Failed At</th>
              <th>Recovery Action</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((f) => (
              <tr key={f.id}>
                <td>{f.contractId}</td>
                <td>{f.clientName}</td>
                <td>{f.failureReason}</td>
                <td>{f.assignedTo}</td>
                <td>{new Date(f.failedAt).toLocaleString()}</td>
                <td>{f.recoveryAction}</td>
                <td>{statusBadge(f.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default FailedContracts;
