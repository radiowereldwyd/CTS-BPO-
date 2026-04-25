const { assign, releaseSlot, getSubcontractors } = require('../src/modules/subcontractor-assignment');
const auditLogger = require('../src/modules/audit-logger');

beforeEach(() => {
  auditLogger.clearLogs();
});

describe('assign', () => {
  test('returns an assignment with subcontractor details', async () => {
    const result = await assign({ contractId: 100, contractType: 'data-entry', complexity: 3 });
    expect(result.contractId).toBe(100);
    expect(result.subcontractorId).toBeDefined();
    expect(result.subcontractorName).toBeDefined();
    expect(result.status).toBe('assigned');
  });

  test('logs a contract.assigned audit event', async () => {
    await assign({ contractId: 101, contractType: 'transcription', complexity: 2 });
    const logs = await auditLogger.getLogs({ eventType: 'contract.assigned' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[logs.length - 1].entityId).toBe(101);
  });

  test('selects subcontractor with highest score', async () => {
    const result = await assign({ contractId: 200, contractType: 'accounting', complexity: 5 });
    expect(result.successRate).toBeGreaterThan(0.8);
  });
});

describe('getSubcontractors', () => {
  test('returns a list of subcontractors with availability info', async () => {
    const subs = await getSubcontractors();
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.length).toBeGreaterThan(0);
    subs.forEach((s) => {
      expect(s.id).toBeDefined();
      expect(s.name).toBeDefined();
      expect(typeof s.availableSlots).toBe('number');
      expect(typeof s.successRate).toBe('number');
    });
  });
});

describe('releaseSlot', () => {
  test('does not throw when releasing a valid subcontractor slot', async () => {
    await expect(releaseSlot(1)).resolves.not.toThrow();
  });

  test('does not throw for unknown subcontractor id', async () => {
    await expect(releaseSlot(9999)).resolves.not.toThrow();
  });
});

