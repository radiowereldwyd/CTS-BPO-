const { log, getLogs, getFailedContracts, clearLogs } = require('../src/modules/audit-logger');

beforeEach(() => {
  clearLogs();
});

describe('log', () => {
  test('creates a log entry with correct fields', () => {
    const entry = log('contract.created', 'contract', 1, 'Test contract created', null, 'info');
    expect(entry.eventType).toBe('contract.created');
    expect(entry.entityType).toBe('contract');
    expect(entry.entityId).toBe(1);
    expect(entry.description).toBe('Test contract created');
    expect(entry.status).toBe('info');
    expect(entry.timestamp).toBeDefined();
  });

  test('defaults invalid status to info', () => {
    const entry = log('system.error', null, null, 'Bad status', null, 'INVALID_STATUS');
    expect(entry.status).toBe('info');
  });

  test('accepts all valid statuses', () => {
    ['info', 'warning', 'error', 'critical'].forEach((status) => {
      const entry = log('test.event', null, null, 'desc', null, status);
      expect(entry.status).toBe(status);
    });
  });

  test('assigns sequential IDs', () => {
    const a = log('event.a', null, null, 'A');
    const b = log('event.b', null, null, 'B');
    expect(b.id).toBe(a.id + 1);
  });
});

describe('getLogs', () => {
  beforeEach(() => {
    log('contract.created', 'contract', 1, 'Created', null, 'info');
    log('contract.failed', 'contract', 2, 'Failed', null, 'error');
    log('payment.succeeded', 'transaction', 10, 'Paid', null, 'info');
  });

  test('returns all logs when no filter given', () => {
    expect(getLogs().length).toBe(3);
  });

  test('filters by eventType', () => {
    const results = getLogs({ eventType: 'contract.failed' });
    expect(results.length).toBe(1);
    expect(results[0].entityId).toBe(2);
  });

  test('filters by status', () => {
    const results = getLogs({ status: 'error' });
    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe('contract.failed');
  });

  test('filters by entityId', () => {
    const results = getLogs({ entityId: 10 });
    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe('payment.succeeded');
  });
});

describe('getFailedContracts', () => {
  test('returns only contract.failed entries', () => {
    log('contract.created', 'contract', 1, 'Created', null, 'info');
    log('contract.failed', 'contract', 2, 'Failed A', null, 'error');
    log('contract.failed', 'contract', 3, 'Failed B', null, 'error');

    const failed = getFailedContracts();
    expect(failed.length).toBe(2);
    failed.forEach((f) => expect(f.eventType).toBe('contract.failed'));
  });

  test('returns empty array when no failures', () => {
    log('contract.created', 'contract', 1, 'Created', null, 'info');
    expect(getFailedContracts()).toHaveLength(0);
  });
});
