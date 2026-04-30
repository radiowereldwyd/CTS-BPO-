import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './Payments.css';

// Always read the freshest token directly from storage
function getAuthHeaders() {
  const token = localStorage.getItem('cts_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Payments() {
  const [paymentData, setPaymentData] = useState({
    clientName: '', invoiceNumber: '', amount: '', description: '', currency: 'USD',
  });
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [paypalClientId, setPaypalClientId] = useState(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [activeGateway, setActiveGateway] = useState('paypal');
  const [loading, setLoading] = useState(false);
  const [ozowLink, setOzowLink] = useState(null);
  const paypalRendered = useRef(false);

  useEffect(() => {
    loadConfig();
    loadHistory();
  }, []);

  async function loadConfig() {
    try {
      const res = await axios.get('/api/payments/config', { headers: getAuthHeaders() });
      setPaypalClientId(res.data.clientId);
    } catch (err) {
      console.error('Could not load payment config:', err.message);
    }
  }

  async function loadHistory() {
    try {
      const res = await axios.get('/api/audit-logs?eventType=payment', { headers: getAuthHeaders() });
      const rows = Array.isArray(res.data) ? res.data : [];
      const mapped = rows.slice(0, 20).map((r, i) => ({
        id: r.id || i,
        clientName: 'CTS Client',
        invoiceNumber: `INV-${String(r.id || i).padStart(3, '0')}`,
        amount: 0,
        status: r.status === 'info' ? 'completed' : 'pending',
        date: r.timestamp ? r.timestamp.split('T')[0] : new Date().toISOString().split('T')[0],
        transactionId: `TXN-${r.id || i}`,
        gateway: 'system',
      }));
      if (mapped.length > 0) setPaymentHistory(mapped);
    } catch {
      // keep empty
    }
  }

  // Load PayPal SDK once we have the client ID
  useEffect(() => {
    if (!paypalClientId) return;
    if (window.paypal) { setSdkLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=USD&intent=capture`;
    script.async = true;
    script.onload  = () => setSdkLoaded(true);
    script.onerror = () => console.error('PayPal SDK failed to load');
    document.body.appendChild(script);
  }, [paypalClientId]);

  const renderPayPalButtons = useCallback(() => {
    if (!sdkLoaded || !window.paypal || paypalRendered.current) return;
    if (!paymentData.amount || !paymentData.clientName || !paymentData.invoiceNumber) return;

    const container = document.getElementById('paypal-button-container');
    if (!container) return;
    container.innerHTML = '';
    paypalRendered.current = true;

    window.paypal.Buttons({
      createOrder: async () => {
        try {
          const res = await axios.post('/api/payments/paypal/create-order', {
            amount: parseFloat(paymentData.amount).toFixed(2),
            currency: 'USD',
            description: paymentData.description || `Invoice ${paymentData.invoiceNumber}`,
            invoiceId: paymentData.invoiceNumber,
          }, { headers: getAuthHeaders() });
          return res.data.id;
        } catch (err) {
          const msg = err.response?.data?.error || err.message;
          setPaymentStatus({ type: 'error', message: `Order creation failed: ${msg}` });
          throw err;
        }
      },
      onApprove: async (data) => {
        try {
          const res = await axios.post('/api/payments/paypal/capture-order',
            { orderId: data.orderID }, { headers: getAuthHeaders() });
          const capture = res.data;
          const newPayment = {
            id: Date.now(),
            clientName: paymentData.clientName,
            invoiceNumber: paymentData.invoiceNumber,
            amount: parseFloat(paymentData.amount),
            status: 'completed',
            date: new Date().toISOString().split('T')[0],
            transactionId: capture.id || data.orderID,
            gateway: 'paypal',
          };
          setPaymentHistory(prev => [newPayment, ...prev]);
          setPaymentStatus({ type: 'success', message: `✅ Payment of $${paymentData.amount} received!`, transactionId: capture.id });
          setTimeout(() => resetForm(), 4000);
        } catch (err) {
          setPaymentStatus({ type: 'error', message: 'Capture failed: ' + (err.response?.data?.error || err.message) });
        }
      },
      onError: () => {
        setPaymentStatus({ type: 'error', message: 'PayPal error. Please try again.' });
        paypalRendered.current = false;
      },
      onCancel: () => {
        setPaymentStatus({ type: 'error', message: 'Payment cancelled.' });
        paypalRendered.current = false;
      },
    }).render('#paypal-button-container').catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkLoaded, paymentData.amount, paymentData.clientName, paymentData.invoiceNumber, paymentData.description]);

  useEffect(() => {
    paypalRendered.current = false;
    if (showPaymentForm && activeGateway === 'paypal') {
      setTimeout(renderPayPalButtons, 150);
    }
  }, [paymentData.amount, paymentData.clientName, paymentData.invoiceNumber,
      showPaymentForm, activeGateway, renderPayPalButtons]);

  async function handleOzowPayment(e) {
    e.preventDefault();
    if (!paymentData.amount || !paymentData.clientName) return;
    setLoading(true);
    setPaymentStatus(null);
    setOzowLink(null);
    try {
      const amountCents = Math.round(parseFloat(paymentData.amount) * 100);
      const res = await axios.post('/api/payments/initiate', {
        contractId: paymentData.invoiceNumber || `CTS-${Date.now()}`,
        amount: amountCents,
        clientEmail: `${paymentData.clientName.toLowerCase().replace(/\s+/g, '.')}@client.com`,
        reference: paymentData.invoiceNumber,
      }, { headers: getAuthHeaders() });

      const result = res.data;
      const newPayment = {
        id: Date.now(),
        clientName: paymentData.clientName,
        invoiceNumber: paymentData.invoiceNumber,
        amount: parseFloat(paymentData.amount),
        status: 'completed',
        date: new Date().toISOString().split('T')[0],
        transactionId: result.paymentReference,
        gateway: 'ozow',
      };
      setPaymentHistory(prev => [newPayment, ...prev]);

      if (result.paymentUrl) {
        // Show clickable link — don't use window.open (blocked by popups)
        setOzowLink(result.paymentUrl);
        setPaymentStatus({ type: 'success', message: `✅ Ozow payment request created! Click the link below to complete payment.`, transactionId: result.paymentReference });
      } else {
        setPaymentStatus({ type: 'success', message: `✅ Ozow payment initiated in test mode. Ref: ${result.paymentReference}`, transactionId: result.paymentReference });
        setTimeout(() => resetForm(), 4000);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setPaymentStatus({ type: 'error', message: `Ozow error: ${msg}` });
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setShowPaymentForm(false);
    setPaymentData({ clientName: '', invoiceNumber: '', amount: '', description: '', currency: 'USD' });
    setPaymentStatus(null);
    setOzowLink(null);
    paypalRendered.current = false;
  }

  const handleInputChange = (e) => {
    paypalRendered.current = false;
    setPaymentData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const totalRevenue = paymentHistory.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const completedCount = paymentHistory.filter(p => p.status === 'completed').length;

  return (
    <div className="payments-container">
      <div className="payments-header">
        <h1>💳 Payment Management</h1>
        <p>Process payments via PayPal (USD) or Ozow (ZAR)</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Total Revenue</h3>
            <p className="stat-value">${totalRevenue.toFixed(2)}</p>
            <span className="stat-label">USD equivalent</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Payments Received</h3>
            <p className="stat-value">{completedCount}</p>
            <span className="stat-label">Completed</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏦</div>
          <div className="stat-content">
            <h3>Average Payment</h3>
            <p className="stat-value">${(totalRevenue / (completedCount || 1)).toFixed(2)}</p>
            <span className="stat-label">Per transaction</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">{paypalClientId ? '🟢' : '🟡'}</div>
          <div className="stat-content">
            <h3>PayPal Status</h3>
            <p className="stat-value">{paypalClientId ? 'READY' : 'LOADING'}</p>
            <span className="stat-label">{paypalClientId ? 'Sandbox Connected' : 'Connecting...'}</span>
          </div>
        </div>
      </div>

      <div className="payment-actions">
        {!showPaymentForm && (
          <button className="btn-new-payment" onClick={() => { setShowPaymentForm(true); setPaymentStatus(null); setOzowLink(null); }}>
            ➕ New Payment
          </button>
        )}
      </div>

      {showPaymentForm && (
        <div className="payment-form-container">
          <div className="payment-form">
            <h2>Create New Payment</h2>

            <div className="gateway-selector">
              <button className={`gateway-btn ${activeGateway === 'paypal' ? 'active' : ''}`}
                onClick={() => { setActiveGateway('paypal'); paypalRendered.current = false; setPaymentStatus(null); setOzowLink(null); }}>
                💵 PayPal (USD)
              </button>
              <button className={`gateway-btn ${activeGateway === 'ozow' ? 'active' : ''}`}
                onClick={() => { setActiveGateway('ozow'); setPaymentStatus(null); setOzowLink(null); }}>
                🏦 Ozow (ZAR)
              </button>
            </div>

            {paymentStatus && (
              <div className={`payment-status ${paymentStatus.type}`}>
                <p>{paymentStatus.message}</p>
                {paymentStatus.transactionId && <small>Ref: {paymentStatus.transactionId}</small>}
              </div>
            )}

            {ozowLink && (
              <div className="ozow-link-box">
                <p>Click below to complete your Ozow payment:</p>
                <a href={ozowLink} target="_blank" rel="noopener noreferrer" className="btn-ozow-link">
                  🏦 Open Ozow Payment Page
                </a>
                <button className="btn-cancel" style={{ marginTop: 10 }} onClick={resetForm}>Done</button>
              </div>
            )}

            {!ozowLink && (
              <form onSubmit={activeGateway === 'ozow' ? handleOzowPayment : (e) => e.preventDefault()}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Client Name:</label>
                    <input type="text" name="clientName" value={paymentData.clientName}
                      onChange={handleInputChange} placeholder="e.g., John Doe" required />
                  </div>
                  <div className="form-group">
                    <label>Invoice Number:</label>
                    <input type="text" name="invoiceNumber" value={paymentData.invoiceNumber}
                      onChange={handleInputChange} placeholder="e.g., INV-001" required />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Amount ({activeGateway === 'ozow' ? 'ZAR' : 'USD'}):</label>
                    <input type="number" name="amount" value={paymentData.amount}
                      onChange={handleInputChange} placeholder="e.g., 100.00" step="0.01" min="0.01" required />
                  </div>
                  <div className="form-group">
                    <label>Gateway:</label>
                    <div className="currency-display">
                      {activeGateway === 'paypal' ? '💵 PayPal – USD' : '🏦 Ozow – ZAR'}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description:</label>
                  <textarea name="description" value={paymentData.description}
                    onChange={handleInputChange} placeholder="e.g., Data Entry Services – May 2026" rows="2" />
                </div>

                {activeGateway === 'paypal' && (
                  paymentData.amount && paymentData.clientName && paymentData.invoiceNumber ? (
                    <div className="paypal-button-wrapper">
                      <div className="payment-summary">
                        <p><strong>{paymentData.clientName}</strong> pays <strong className="amount">${parseFloat(paymentData.amount || 0).toFixed(2)} USD</strong></p>
                        <p className="invoice">Invoice: {paymentData.invoiceNumber}</p>
                      </div>
                      <div id="paypal-button-container" className="paypal-container" style={{ minHeight: 60, marginTop: 16 }} />
                    </div>
                  ) : (
                    <div className="form-warning">⚠️ Fill in Client Name, Invoice Number, and Amount to show PayPal button</div>
                  )
                )}

                {activeGateway === 'ozow' && (
                  <button type="submit" className="btn-ozow" disabled={loading || !paymentData.amount || !paymentData.clientName}>
                    {loading ? '⏳ Processing...' : '🏦 Pay via Ozow (ZAR)'}
                  </button>
                )}

                <button type="button" className="btn-cancel" onClick={resetForm}>✕ Cancel</button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="payment-history">
        <h2>💳 Payment History</h2>
        {paymentHistory.length === 0 ? (
          <div className="empty-state"><p>No payments yet. Create your first payment above!</p></div>
        ) : (
          <div className="payment-table">
            <div className="table-header">
              <div className="col-client">Client</div>
              <div className="col-invoice">Invoice</div>
              <div className="col-amount">Amount</div>
              <div className="col-date">Date</div>
              <div className="col-status">Status</div>
              <div className="col-txn">Transaction ID</div>
            </div>
            {paymentHistory.map((p) => (
              <div key={p.id} className="table-row">
                <div className="col-client">{p.clientName}</div>
                <div className="col-invoice">{p.invoiceNumber}</div>
                <div className="col-amount">${p.amount.toFixed(2)}</div>
                <div className="col-date">{p.date}</div>
                <div className="col-status">
                  <span className={`status-badge ${p.status}`}>
                    {p.status === 'completed' ? '✅ Completed' : '⏳ Pending'}
                  </span>
                  {p.gateway && <span className="gateway-tag">{p.gateway}</span>}
                </div>
                <div className="col-txn"><code>{String(p.transactionId).substring(0, 24)}...</code></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="payment-help">
        <h3>🧪 Sandbox / Test Mode</h3>
        <ul>
          <li>✅ <strong>PayPal:</strong> Sandbox connected — use your PayPal test buyer account</li>
          <li>✅ <strong>Ozow:</strong> Site code <strong>CTS-CTS-001</strong> — test EFT payments</li>
          <li>✅ All transactions are saved to the database automatically</li>
          <li>✅ Switch to live by setting NODE_ENV=production on deploy</li>
        </ul>
      </div>
    </div>
  );
}

export default Payments;
