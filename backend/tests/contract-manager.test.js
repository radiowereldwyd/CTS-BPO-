const { analyzeContract, markFailed, markCompleted } = require('../src/modules/contract-manager');
const auditLogger = require('../src/modules/audit-logger');

beforeEach(() => {
  auditLogger.clearLogs();
});

describe('analyzeContract', () => {
  test('returns a risk score and estimated delivery', () => {
    const result = analyzeContract({ complexity: 5, value: 10000 });
    expect(result.riskScore).toBeDefined();
    expect(result.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('higher complexity increases risk score', () => {
    const low = analyzeContract({ complexity: 2, value: 10000 });
    const high = analyzeContract({ complexity: 8, value: 10000 });
    expect(high.riskScore).toBeGreaterThan(low.riskScore);
  });

  test('high-value contracts add to risk score', () => {
    const normal = analyzeContract({ complexity: 5, value: 50000 });
    const highValue = analyzeContract({ complexity: 5, value: 200000 });
    expect(highValue.riskScore).toBeGreaterThan(normal.riskScore);
  });

  test('risk score is capped at 10', () => {
    const result = analyzeContract({ complexity: 10, value: 999999 });
    expect(result.riskScore).toBeLessThanOrEqual(10);
  });

  test('defaults complexity and value when not provided', () => {
    const result = analyzeContract({});
    expect(result.riskScore).toBeDefined();
    expect(result.estimatedDelivery).toBeDefined();
  });
});

describe('markFailed', () => {
  test('logs a contract.failed event', () => {
    markFailed(42, 'Missed deadline');
    const failed = auditLogger.getLogs({ eventType: 'contract.failed' });
    expect(failed.length).toBe(1);
    expect(failed[0].entityId).toBe(42);
    expect(failed[0].status).toBe('error');
  });
});

describe('markCompleted', () => {
  test('logs a contract.completed event', () => {
    markCompleted(7);
    const completed = auditLogger.getLogs({ eventType: 'contract.completed' });
    expect(completed.length).toBe(1);
    expect(completed[0].entityId).toBe(7);
    expect(completed[0].status).toBe('info');
  });
});
