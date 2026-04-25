const { log, getLogs, getFailedContracts, clearLogs } = require('../src/modules/audit-logger');

beforeEach(() => {
  clearLogs();
});

describe('log', () => {
  test('creates a log entry with correct fields', async () => {
    const entry = await log('contract.created', 'contract', 1, 'Test contract created', null, 'info');
    expect(entry.eventType).toBe('contract.created');
    expect(entry.entityType).toBe('contract');
    expect(entry.entityId).toBe(1);
    expect(entry.description).toBe('Test contract created');
    expect(entry.status).toBe('info');
    expect(entry.timestamp).toBeDefined();
  });

  test('defaults invalid status to info', async () => {
    const entry = await log('system.error', null, null, 'Bad status', null, 'INVALID_STATUS');
    expect(entry.status).toBe('info');
  });

  test('accepts all valid statuses', async () => {
    for (const status of ['info', 'warning', 'error', 'critical']) {
      const entry = await log('test.event', null, null, 'desc', null, status);
      expect(entry.status).toBe(status);
    }
  });

  test('assigns sequential IDs', async () => {
    const a = await log('event.a', null, null, 'A');
    const b = await log('event.b', null, null, 'B');
    expect(b.id).toBe(a.id + 1);
  });
});

describe('getLogs', () => {
  beforeEach(async () => {
    await log('contract.created', 'contract', 1, 'Created', null, 'info');
    await log('contract.failed', 'contract', 2, 'Failed', null, 'error');
    await log('payment.succeeded', 'transaction', 10, 'Paid', null, 'info');
  });

  test('returns all logs when no filter given', async () => {
    expect((await getLogs()).length).toBe(3);
  });

  test('filters by eventType', async () => {
    const results = await getLogs({ eventType: 'contract.failed' });
    expect(results.length).toBe(1);
    expect(results[0].entityId).toBe(2);
  });

  test('filters by status', async () => {
    const results = await getLogs({ status: 'error' });
    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe('contract.failed');
  });

  test('filters by entityId', async () => {
    const results = await getLogs({ entityId: 10 });
    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe('payment.succeeded');
  });
});

describe('getFailedContracts', () => {
  test('returns only contract.failed entries', async () => {
    await log('contract.created', 'contract', 1, 'Created', null, 'info');
    await log('contract.failed', 'contract', 2, 'Failed A', null, 'error');
    await log('contract.failed', 'contract', 3, 'Failed B', null, 'error');

    const failed = await getFailedContracts();
    expect(failed.length).toBe(2);
    failed.forEach((f) => expect(f.eventType).toBe('contract.failed'));
  });

  test('returns empty array when no failures', async () => {
    await log('contract.created', 'contract', 1, 'Created', null, 'info');
    expect(await getFailedContracts()).toHaveLength(0);
  });
});

