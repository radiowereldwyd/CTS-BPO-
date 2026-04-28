import React, { useState, useEffect } from 'react';
import './Payments.css';

function Payments() {
  const [paymentData, setPaymentData] = useState({
    clientName: '',
    invoiceNumber: '',
    amount: '',
    description: '',
    currency: 'USD' // ALWAYS USD for PayPal
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
  const PAYPAL_CLIENT_ID = 'AcaMoiCekiZl_ttpee4L';

  // Load PayPal SDK
  useEffect(() => {
    // Remove any existing PayPal script
    const existingScript = document.querySelector('script[src*="paypal"]');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => {
      console.log('PayPal SDK loaded successfully');
      setSdkLoaded(true);
    };
    script.onerror = () => {
      console.error('Failed to load PayPal SDK');
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup
    };
  }, []);

  // Initialize PayPal buttons when SDK loads and amount is set
  useEffect(() => {
    if (
      sdkLoaded &&
      window.paypal &&
      paymentData.amount &&
      paymentData.clientName &&
      paymentData.invoiceNumber
    ) {
      // Clear any existing buttons
      const container = document.getElementById('paypal-button-container');
      if (container) {
        container.innerHTML = '';
      }

      window.paypal
        .Buttons({
          createOrder: (data, actions) => {
            console.log('Creating order for:', paymentData.amount);
            return actions.order.create({
              purchase_units: [
                {
                  amount: {
                    value: parseFloat(paymentData.amount).toFixed(2),
                  },
                  description:
                    paymentData.description ||
                    `Invoice ${paymentData.invoiceNumber}`,
                },
              ],
            });
          },
          onApprove: (data, actions) => {
            console.log('Payment approved:', data);
            return actions.order.capture().then((orderData) => {
              // Payment successful!
              const newPayment = {
                id: paymentHistory.length + 1,
                clientName: paymentData.clientName,
                invoiceNumber: paymentData.invoiceNumber,
                amount: parseFloat(paymentData.amount),
                currency: 'USD',
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

              // Reset form after 3 seconds
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
              message:
                '❌ Payment Failed. Please try again or check the console for details.',
            });
          },
          onCancel: (data) => {
            console.log('Payment cancelled:', data);
            setPaymentStatus({
              type: 'error',
              message: '❌ Payment Cancelled by user.',
            });
          },
        })
        .render('#paypal-button-container')
        .catch((err) => {
          console.error('Error rendering PayPal button:', err);
        });
    }
  }, [sdkLoaded, paymentData.amount, paymentData.clientName, paymentData.invoiceNumber, paymentHistory]);

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
            <p className="stat-value">
              ${(getTotalRevenue() / getPaymentCount() || 0).toFixed(2)}
            </p>
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
                <label htmlFor="amount">Amount (USD):</label>
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
                <div
                  style={{
                    padding: '12px 15px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    borderRadius: '6px',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#e2e8f0',
                  }}
                >
                  USD (PayPal Sandbox requires USD)
                </div>
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
                      <strong className="amount">${paymentData.amount}</strong>
                    </p>
                    <p className="invoice">Invoice: {paymentData.invoiceNumber}</p>
                  </div>

                  <div
                    id="paypal-button-container"
                    className="paypal-container"
                    style={{ minHeight: '50px' }}
                  ></div>
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
                <div className="col-amount">${payment.amount.toFixed(2)}</div>
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
        <h3>🧪 SANDBOX TEST MODE - HOW TO TEST</h3>
        <ul>
          <li>✅ This is TEST MODE - no real money is charged</li>
          <li>✅ Fill in Client Name, Invoice Number, and Amount (USD only)</li>
          <li>✅ Click "PayPal Checkout" button (blue button that appears)</li>
          <li>✅ You'll see PayPal login page (TEST/SANDBOX page)</li>
          <li>✅ Use any test email to complete payment</li>
          <li>✅ After payment, you'll see success message ✅</li>
          <li>✅ Payment appears in history table below</li>
          <li>
            ✅ When ready for REAL payments, we just change ONE line (Client ID)!
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Payments;