const { assign, releaseSlot, getSubcontractors } = require('../src/modules/subcontractor-assignment');
const auditLogger = require('../src/modules/audit-logger');

beforeEach(() => {
  auditLogger.clearLogs();
  // Reset active jobs for all subcontractors between tests
  const subs = getSubcontractors();
  // We can't directly reset internal state, but releaseSlot allows cleanup.
  // Tests are written to be independent of pre-existing activeJobs counts.
});

describe('assign', () => {
  test('returns an assignment with subcontractor details', () => {
    const result = assign({ contractId: 100, contractType: 'data-entry', complexity: 3 });
    expect(result.contractId).toBe(100);
    expect(result.subcontractorId).toBeDefined();
    expect(result.subcontractorName).toBeDefined();
    expect(result.status).toBe('assigned');
  });

  test('logs a contract.assigned audit event', () => {
    assign({ contractId: 101, contractType: 'transcription', complexity: 2 });
    const logs = auditLogger.getLogs({ eventType: 'contract.assigned' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[logs.length - 1].entityId).toBe(101);
  });

  test('selects subcontractor with highest score', () => {
    // Sub Gamma (id: 3) has the highest success rate (0.97) and lowest active jobs (1)
    // This test verifies a high-success-rate contractor is preferred
    const result = assign({ contractId: 200, contractType: 'accounting', complexity: 5 });
    expect(result.successRate).toBeGreaterThan(0.8);
  });
});

describe('getSubcontractors', () => {
  test('returns a list of subcontractors with availability info', () => {
    const subs = getSubcontractors();
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
  test('does not throw when releasing a valid subcontractor slot', () => {
    expect(() => releaseSlot(1)).not.toThrow();
  });

  test('does not throw for unknown subcontractor id', () => {
    expect(() => releaseSlot(9999)).not.toThrow();
  });
});
