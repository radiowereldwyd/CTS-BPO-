import React, { useState, useEffect } from 'react';
import './Payments.css';

function Payments() {
  const [paymentData, setPaymentData] = useState({
    clientName: '',
    invoiceNumber: '',
    amount: '',
    description: '',
    currency: 'USD'
  });

  const [paymentHistory, setPaymentHistory] = useState([
    {
      id: 1,
      clientName: 'Demo Client',
      invoiceNumber: 'INV-001',
      amount: 150,
      currency: 'USD',
      status: 'completed',
      date: '2026-04-25',
      transactionId: 'TEST-TXN-001'
    },
    {
      id: 2,
      clientName: 'Test Client',
      invoiceNumber: 'INV-002',
      amount: 250,
      currency: 'USD',
      status: 'completed',
      date: '2026-04-26',
      transactionId: 'TEST-TXN-002'
    }
  ]);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Your PayPal Sandbox Client ID
  const PAYPAL_CLIENT_ID = 'AcaMoiCekiZl_ttpee4L'; // Replace with your actual Client ID

  // Load PayPal SDK
  useEffect(() => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Initialize PayPal buttons when SDK loads
  useEffect(() => {
    if (sdkLoaded && window.paypal && paymentData.amount) {
      window.paypal
        .Buttons({
          createOrder: (data, actions) => {
            return actions.order.create({
              purchase_units: [
                {
                  amount: {
                    value: paymentData.amount.toString(),
                  },
                  description: paymentData.description || `Invoice ${paymentData.invoiceNumber}`,
                },
              ],
            });
          },
          onApprove: (data, actions) => {
            return actions.order.capture().then((orderData) => {
              // Payment successful!
              const newPayment = {
                id: paymentHistory.length + 1,
                clientName: paymentData.clientName,
                invoiceNumber: paymentData.invoiceNumber,
                amount: parseFloat(paymentData.amount),
                currency: paymentData.currency,
                status: 'completed',
                date: new Date().toISOString().split('T')[0],
                transactionId: orderData.id,
              };

              setPaymentHistory([newPayment, ...paymentHistory]);
              setPaymentStatus({
                type: 'success',
                message: `✅ Payment Received! Transaction ID: ${orderData.id}`,
                transactionId: orderData.id,
                amount: paymentData.amount,
              });

              // Reset form
              setTimeout(() => {
                setPaymentData({
                  clientName: '',
                  invoiceNumber: '',
                  amount: '',
                  description: '',
                  currency: 'USD',
                });
                setShowPaymentForm(false);
              }, 3000);
            });
          },
          onError: (err) => {
            console.error('PayPal error:', err);
            setPaymentStatus({
              type: 'error',
              message: '❌ Payment Failed. Please try again.',
            });
          },
        })
        .render('#paypal-button-container');
    }
  }, [sdkLoaded, paymentData.amount, paymentHistory]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPaymentData({
      ...paymentData,
      [name]: value,
    });
  };

  const handleNewPayment = () => {
    setShowPaymentForm(true);
    setPaymentStatus(null);
  };

  const handleCancel = () => {
    setShowPaymentForm(false);
    setPaymentData({
      clientName: '',
      invoiceNumber: '',
      amount: '',
      description: '',
      currency: 'USD',
    });
    setPaymentStatus(null);
  };

  const getTotalRevenue = () => {
    return paymentHistory
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0)
      .toFixed(2);
  };

  const getPaymentCount = () => {
    return paymentHistory.filter((p) => p.status === 'completed').length;
  };

  return (
    <div className="payments-container">
      {/* Header */}
      <div className="payments-header">
        <h1>💳 Payment Management</h1>
        <p>Manage client payments and track revenue</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Total Revenue</h3>
            <p className="stat-value">${getTotalRevenue()}</p>
            <span className="stat-label">USD</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Payments Received</h3>
            <p className="stat-value">{getPaymentCount()}</p>
            <span className="stat-label">Completed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🏦</div>
          <div className="stat-content">
            <h3>Average Payment</h3>
            <p className="stat-value">${(getTotalRevenue() / getPaymentCount() || 0).toFixed(2)}</p>
            <span className="stat-label">Per transaction</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🧪</div>
          <div className="stat-content">
            <h3>Mode</h3>
            <p className="stat-value">SANDBOX</p>
            <span className="stat-label">Test Mode (Fake $)</span>
          </div>
        </div>
      </div>

      {/* New Payment Button */}
      <div className="payment-actions">
        {!showPaymentForm ? (
          <button className="btn-new-payment" onClick={handleNewPayment}>
            ➕ New Payment
          </button>
        ) : null}
      </div>

      {/* Payment Form */}
      {showPaymentForm && (
        <div className="payment-form-container">
          <div className="payment-form">
            <h2>Create New Payment</h2>

            {paymentStatus && (
              <div className={`payment-status ${paymentStatus.type}`}>
                <p>{paymentStatus.message}</p>
                {paymentStatus.transactionId && (
                  <small>ID: {paymentStatus.transactionId}</small>
                )}
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="clientName">Client Name:</label>
                <input
                  id="clientName"
                  type="text"
                  name="clientName"
                  value={paymentData.clientName}
                  onChange={handleInputChange}
                  placeholder="e.g., John Doe"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="invoiceNumber">Invoice Number:</label>
                <input
                  id="invoiceNumber"
                  type="text"
                  name="invoiceNumber"
                  value={paymentData.invoiceNumber}
                  onChange={handleInputChange}
                  placeholder="e.g., INV-001"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="amount">Amount:</label>
                <input
                  id="amount"
                  type="number"
                  name="amount"
                  value={paymentData.amount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="currency">Currency:</label>
                <select
                  id="currency"
                  name="currency"
                  value={paymentData.currency}
                  onChange={handleInputChange}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="ZAR">ZAR (R)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description:</label>
              <textarea
                id="description"
                name="description"
                value={paymentData.description}
                onChange={handleInputChange}
                placeholder="e.g., Data Entry Services - May 2026"
                rows="3"
              />
            </div>

            {paymentData.amount && paymentData.clientName && paymentData.invoiceNumber ? (
              <>
                <div className="paypal-button-wrapper">
                  <h3>Payment Summary:</h3>
                  <div className="payment-summary">
                    <p>
                      <strong>{paymentData.clientName}</strong> pays{' '}
                      <strong className="amount">
                        {paymentData.currency === 'USD' && '$'}
                        {paymentData.amount}
                      </strong>
                    </p>
                    <p className="invoice">Invoice: {paymentData.invoiceNumber}</p>
                  </div>

                  <div id="paypal-button-container" className="paypal-container"></div>
                </div>
              </>
            ) : (
              <div className="form-warning">
                ⚠️ Please fill in Client Name, Invoice Number, and Amount to proceed
              </div>
            )}

            <button className="btn-cancel" onClick={handleCancel}>
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="payment-history">
        <h2>💳 Payment History</h2>

        {paymentHistory.length === 0 ? (
          <div className="empty-state">
            <p>No payments yet. Create your first payment!</p>
          </div>
        ) : (
          <div className="payment-table">
            <div className="table-header">
              <div className="col-client">Client Name</div>
              <div className="col-invoice">Invoice</div>
              <div className="col-amount">Amount</div>
              <div className="col-date">Date</div>
              <div className="col-status">Status</div>
              <div className="col-txn">Transaction ID</div>
            </div>

            {paymentHistory.map((payment) => (
              <div key={payment.id} className="table-row">
                <div className="col-client">{payment.clientName}</div>
                <div className="col-invoice">{payment.invoiceNumber}</div>
                <div className="col-amount">
                  {payment.currency === 'USD' && '$'}
                  {payment.amount.toFixed(2)}
                </div>
                <div className="col-date">{payment.date}</div>
                <div className="col-status">
                  <span className={`status-badge ${payment.status}`}>
                    {payment.status === 'completed' ? '✅ Completed' : '⏳ Pending'}
                  </span>
                </div>
                <div className="col-txn">
                  <code>{payment.transactionId.substring(0, 20)}...</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="payment-help">
        <h3>🧪 SANDBOX TEST MODE</h3>
        <ul>
          <li>✅ This is TEST MODE - no real money is charged</li>
          <li>✅ Payments are fake for testing only</li>
          <li>✅ Use any test email: test@example.com</li>
          <li>✅ When you click PayPal button, you'll see TEST payment page</li>
          <li>✅ Approve the payment to see success message</li>
          <li>✅ When ready for REAL payments, we change ONE line of code!</li>
        </ul>
      </div>
    </div>
  );
}

export default Payments;