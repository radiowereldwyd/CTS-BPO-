const { initiatePayment, generateInvoice } = require('../src/modules/payment-gateway');
const auditLogger = require('../src/modules/audit-logger');

beforeEach(() => {
  auditLogger.clearLogs();
  // Ensure we're in test/development mode (not production)
  process.env.NODE_ENV = 'test';
});

describe('initiatePayment', () => {
  test('succeeds with valid parameters', async () => {
    const result = await initiatePayment({
      contractId: 1,
      amount: 1500000, // R15,000.00 in cents
      clientEmail: 'client@example.com',
      reference: 'CTS-1-TEST',
    });
    expect(result.success).toBe(true);
    expect(result.contractId).toBe(1);
    expect(result.currency).toBe('ZAR');
    expect(result.paidAt).toBeDefined();
  });

  test('logs payment.initiated and payment.succeeded events', async () => {
    await initiatePayment({
      contractId: 2,
      amount: 500000,
      clientEmail: 'test@example.com',
    });
    const initiated = await auditLogger.getLogs({ eventType: 'payment.initiated' });
    const succeeded = await auditLogger.getLogs({ eventType: 'payment.succeeded' });
    expect(initiated.length).toBeGreaterThanOrEqual(1);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
  });

  test('uses provided reference in result', async () => {
    const result = await initiatePayment({
      contractId: 3,
      amount: 100000,
      clientEmail: 'ref@example.com',
      reference: 'MY-REF-123',
    });
    expect(result.paymentReference).toBe('MY-REF-123');
  });

  test('throws when required params are missing', async () => {
    await expect(initiatePayment({ amount: 100000 })).rejects.toThrow();
    await expect(initiatePayment({ contractId: 1 })).rejects.toThrow();
    await expect(initiatePayment({})).rejects.toThrow();
  });
});

describe('generateInvoice', () => {
  test('returns an invoice with correct fields', () => {
    const invoice = generateInvoice({
      contractId: 10,
      clientName: 'Acme Corp',
      amount: 50000,
      reference: 'CTS-10-INV',
    });
    expect(invoice.invoiceNumber).toBeDefined();
    expect(invoice.contractId).toBe(10);
    expect(invoice.clientName).toBe('Acme Corp');
    expect(invoice.amount).toBe(50000);
    expect(invoice.currency).toBe('ZAR');
    expect(invoice.status).toBe('paid');
  });

  test('invoice number is unique across calls', () => {
    const a = generateInvoice({ contractId: 1, clientName: 'A', amount: 100, reference: 'R1' });
    const b = generateInvoice({ contractId: 2, clientName: 'B', amount: 200, reference: 'R2' });
    expect(a.invoiceNumber).not.toBe(b.invoiceNumber);
  });
});
