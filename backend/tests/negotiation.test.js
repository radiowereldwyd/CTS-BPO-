const { negotiate, calculateOptimalPrice } = require('../src/modules/negotiation');

describe('negotiate', () => {
  const BASE_COST = 10000;
  const TARGET_PRICE = 15000;

  test('accepts offer at or above target price', () => {
    const result = negotiate({ clientOffer: 15000, baseCost: BASE_COST, targetPrice: TARGET_PRICE });
    expect(result.decision).toBe('accept');
    expect(result.agreedPrice).toBe(15000);
  });

  test('accepts offer above target price', () => {
    const result = negotiate({ clientOffer: 20000, baseCost: BASE_COST, targetPrice: TARGET_PRICE });
    expect(result.decision).toBe('accept');
  });

  test('counters offer above margin floor but below target', () => {
    // margin floor = 10000 * 1.15 = 11500
    const result = negotiate({ clientOffer: 12000, baseCost: BASE_COST, targetPrice: TARGET_PRICE });
    expect(result.decision).toBe('counter');
    expect(result.counterOffer).toBeGreaterThan(12000);
    expect(result.counterOffer).toBeLessThan(TARGET_PRICE);
  });

  test('counter offer is midpoint between offer and target', () => {
    const result = negotiate({ clientOffer: 12000, baseCost: BASE_COST, targetPrice: TARGET_PRICE });
    expect(result.counterOffer).toBe((12000 + 15000) / 2);
  });

  test('rejects offer below margin floor', () => {
    // margin floor = 10000 * 1.15 = 11500; offer of 11000 is below floor
    const result = negotiate({ clientOffer: 11000, baseCost: BASE_COST, targetPrice: TARGET_PRICE });
    expect(result.decision).toBe('reject');
    expect(result.minAcceptable).toBe(11500);
  });

  test('accepts offer exactly at margin floor', () => {
    // 10000 * 1.15 = 11500 — this is above floor (not below), so counter
    const result = negotiate({ clientOffer: 11500, baseCost: BASE_COST, targetPrice: TARGET_PRICE });
    expect(result.decision).toBe('counter');
  });

  test('throws when required params are missing', () => {
    expect(() => negotiate({ clientOffer: 5000 })).toThrow();
    expect(() => negotiate({})).toThrow();
  });
});

describe('calculateOptimalPrice', () => {
  test('returns a recommended price above base cost', () => {
    const result = calculateOptimalPrice({ contractType: 'data-entry', complexity: 5, baseCost: 10000 });
    expect(result.recommendedPrice).toBeGreaterThan(10000);
  });

  test('higher complexity yields higher recommended price', () => {
    const low = calculateOptimalPrice({ contractType: 'x', complexity: 2, baseCost: 10000 });
    const high = calculateOptimalPrice({ contractType: 'x', complexity: 8, baseCost: 10000 });
    expect(high.recommendedPrice).toBeGreaterThan(low.recommendedPrice);
  });

  test('returns the contract type in the result', () => {
    const result = calculateOptimalPrice({ contractType: 'accounting', complexity: 3, baseCost: 5000 });
    expect(result.contractType).toBe('accounting');
  });
});
