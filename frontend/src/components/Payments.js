import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Payments.css';

function getAuthHeaders() {
  const token = localStorage.getItem('cts_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Payments() {
  const [paymentData, setPaymentData] = useState({
    clientName: '', invoiceNumber: '', amount: '', description: '',
  });
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [activeGateway, setActiveGateway] = useState('paypal');
  const [loading, setLoading] = useState(false);
  const [checkoutLink, setCheckoutLink] = useState(null);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const res = await axios.get('/api/audit-logs?eventType=payment', { headers: getAuthHeaders() });
      const rows = Array.isArray(res.data) ? res.data : [];
      if (rows.length > 0) {
        setPaymentHistory(rows.slice(0, 20).map((r, i) => ({
          id: r.id || i,
          clientName: 'CTS Client',
          invoiceNumber: `INV-${String(r.id || i).padStart(3, '0')}`,
          amount: 0,
          status: r.status === 'info' ? 'completed' : 'pending',
          date: (r.timestamp || new Date().toISOString()).split('T')[0],
          transactionId: `TXN-${r.id || i}`,
          gateway: 'system',
        })));
      }
    } catch { /* keep empty */ }
  }

  function resetForm() {
    setShowPaymentForm(false);
    setPaymentData({ clientName: '', invoiceNumber: '', amount: '', description: '' });
    setPaymentStatus(null);
    setCheckoutLink(null);
  }

  const handleInputChange = (e) =>
    setPaymentData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const formValid = paymentData.clientName && paymentData.invoiceNumber && paymentData.amount;

  // ── PayPal: create order server-side → show approval link ──────────────
  async function handlePayPal(e) {
    e.preventDefault();
    if (!formValid) return;
    setLoading(true);
    setPaymentStatus(null);
    setCheckoutLink(null);
    try {
      const res = await axios.post('/api/payments/paypal/create-order', {
        amount: parseFloat(paymentData.amount).toFixed(2),
        currency: 'USD',
        description: paymentData.description || `Invoice ${paymentData.invoiceNumber}`,
        invoiceId: paymentData.invoiceNumber,
      }, { headers: getAuthHeaders() });

      // Find the "approve" link PayPal returns
      const approveLink = res.data.links?.find(l => l.rel === 'approve')?.href;
      if (approveLink) {
        setCheckoutLink({ url: approveLink, gateway: 'paypal', orderId: res.data.id });
        setPaymentStatus({ type: 'success', message: `✅ PayPal order created! Click below to complete payment.`, transactionId: res.data.id });
        setPaymentHistory(prev => [{
          id: Date.now(), clientName: paymentData.clientName,
          invoiceNumber: paymentData.invoiceNumber, amount: parseFloat(paymentData.amount),
          status: 'pending', date: new Date().toISOString().split('T')[0],
          transactionId: res.data.id, gateway: 'paypal',
        }, ...prev]);
      } else {
        setPaymentStatus({ type: 'error', message: 'No approval URL returned from PayPal.' });
      }
    } catch (err) {
      setPaymentStatus({ type: 'error', message: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  }

  // ── Ozow: redirect-based ZAR payment ───────────────────────────────────
  async function handleOzow(e) {
    e.preventDefault();
    if (!formValid) return;
    setLoading(true);
    setPaymentStatus(null);
    setCheckoutLink(null);
    try {
      const res = await axios.post('/api/payments/initiate', {
        contractId: paymentData.invoiceNumber || `CTS-${Date.now()}`,
        amount: Math.round(parseFloat(paymentData.amount) * 100),
        clientEmail: `${paymentData.clientName.toLowerCase().replace(/\s+/g, '.')}@client.com`,
        reference: paymentData.invoiceNumber,
      }, { headers: getAuthHeaders() });

      const result = res.data;
      setPaymentHistory(prev => [{
        id: Date.now(), clientName: paymentData.clientName,
        invoiceNumber: paymentData.invoiceNumber, amount: parseFloat(paymentData.amount),
        status: 'pending', date: new Date().toISOString().split('T')[0],
        transactionId: result.paymentReference, gateway: 'ozow',
      }, ...prev]);

      if (result.paymentUrl) {
        setCheckoutLink({ url: result.paymentUrl, gateway: 'ozow', orderId: result.paymentReference });
        setPaymentStatus({ type: 'success', message: `✅ Ozow payment ready. Click below to pay.`, transactionId: result.paymentReference });
      } else {
        setPaymentStatus({ type: 'success', message: `✅ Ozow test initiated. Ref: ${result.paymentReference}`, transactionId: result.paymentReference });
        setTimeout(resetForm, 4000);
      }
    } catch (err) {
      setPaymentStatus({ type: 'error', message: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  }

  const totalRevenue = paymentHistory.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
  const completedCount = paymentHistory.filter(p => p.status === 'completed').length;

  return (
    <div className="payments-container">
      <div className="payments-header">
        <h1>💳 Payment Management</h1>
        <p>Process payments via PayPal (USD) or Ozow (ZAR)</p>
      </div>

      {/* Stats */}
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
          <div className="stat-icon">🟢</div>
          <div className="stat-content">
            <h3>Gateways</h3>
            <p className="stat-value">2 LIVE</p>
            <span className="stat-label">PayPal + Ozow</span>
          </div>
        </div>
      </div>

      <div className="payment-actions">
        {!showPaymentForm && (
          <button className="btn-new-payment"
            onClick={() => { setShowPaymentForm(true); setPaymentStatus(null); setCheckoutLink(null); }}>
            ➕ New Payment
          </button>
        )}
      </div>

      {showPaymentForm && (
        <div className="payment-form-container">
          <div className="payment-form">
            <h2>Create New Payment</h2>

            {/* Gateway selector */}
            <div className="gateway-selector">
              <button className={`gateway-btn ${activeGateway === 'paypal' ? 'active' : ''}`}
                onClick={() => { setActiveGateway('paypal'); setPaymentStatus(null); setCheckoutLink(null); }}>
                💵 PayPal (USD)
              </button>
              <button className={`gateway-btn ${activeGateway === 'ozow' ? 'active' : ''}`}
                onClick={() => { setActiveGateway('ozow'); setPaymentStatus(null); setCheckoutLink(null); }}>
                🏦 Ozow (ZAR)
              </button>
            </div>

            {/* Status message */}
            {paymentStatus && (
              <div className={`payment-status ${paymentStatus.type}`}>
                <p>{paymentStatus.message}</p>
                {paymentStatus.transactionId && <small>Ref: {paymentStatus.transactionId}</small>}
              </div>
            )}

            {/* Checkout link card — shown after order is created */}
            {checkoutLink && (
              <div className="checkout-link-box">
                {checkoutLink.gateway === 'paypal' ? (
                  <>
                    <p className="checkout-label">Complete your PayPal payment:</p>
                    <a href={checkoutLink.url} target="_blank" rel="noopener noreferrer"
                       className="btn-checkout btn-checkout-paypal">
                      💵 Pay Now with PayPal
                    </a>
                    <p className="checkout-note">Opens PayPal Sandbox — log in with your test buyer account</p>
                  </>
                ) : (
                  <>
                    <p className="checkout-label">Complete your Ozow EFT payment:</p>
                    <a href={checkoutLink.url} target="_blank" rel="noopener noreferrer"
                       className="btn-checkout btn-checkout-ozow">
                      🏦 Pay Now with Ozow
                    </a>
                  </>
                )}
                <button className="btn-cancel" style={{ marginTop: 14 }} onClick={resetForm}>
                  ✕ Cancel / Done
                </button>
              </div>
            )}

            {/* Form — hidden once checkout link is shown */}
            {!checkoutLink && (
              <form onSubmit={activeGateway === 'paypal' ? handlePayPal : handleOzow}>
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
                      onChange={handleInputChange} placeholder="e.g., 100.00"
                      step="0.01" min="0.01" required />
                  </div>
                  <div className="form-group">
                    <label>Currency:</label>
                    <div className="currency-display">
                      {activeGateway === 'paypal' ? '💵 USD — PayPal Sandbox' : '🏦 ZAR — Ozow EFT'}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description:</label>
                  <textarea name="description" value={paymentData.description}
                    onChange={handleInputChange}
                    placeholder="e.g., Data Entry Services – May 2026" rows="2" />
                </div>

                {formValid && (
                  <div className="payment-summary">
                    <p>
                      <strong>{paymentData.clientName}</strong> pays{' '}
                      <strong className="amount">
                        {activeGateway === 'paypal' ? '$' : 'R'}
                        {parseFloat(paymentData.amount).toFixed(2)}
                      </strong>
                      {' '}· Invoice: <em>{paymentData.invoiceNumber}</em>
                    </p>
                  </div>
                )}

                <button type="submit"
                  className={activeGateway === 'paypal' ? 'btn-paypal-submit' : 'btn-ozow'}
                  disabled={loading || !formValid}>
                  {loading
                    ? '⏳ Creating order...'
                    : activeGateway === 'paypal'
                      ? '💵 Create PayPal Order'
                      : '🏦 Pay via Ozow (ZAR)'}
                </button>

                <button type="button" className="btn-cancel" onClick={resetForm}>✕ Cancel</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Payment History */}
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
                <div className="col-amount">{p.gateway === 'ozow' ? 'R' : '$'}{p.amount.toFixed(2)}</div>
                <div className="col-date">{p.date}</div>
                <div className="col-status">
                  <span className={`status-badge ${p.status}`}>
                    {p.status === 'completed' ? '✅ Completed' : '⏳ Pending'}
                  </span>
                  {p.gateway && <span className="gateway-tag">{p.gateway}</span>}
                </div>
                <div className="col-txn"><code>{String(p.transactionId).substring(0, 22)}…</code></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="payment-help">
        <h3>🧪 How It Works</h3>
        <ul>
          <li>✅ <strong>PayPal:</strong> Fill the form → click "Create PayPal Order" → a "Pay Now" button appears → click it to open PayPal Sandbox</li>
          <li>✅ <strong>Ozow:</strong> Fill the form → click "Pay via Ozow" → a link opens Ozow's payment page</li>
          <li>✅ All transactions saved to your database automatically</li>
        </ul>
      </div>
    </div>
  );
}

export default Payments;
